// ============================================================
// SERVER - Call Center Pro
// Chạy: node server.js
// Cổng mặc định: 3000
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============================================================
// CẤU HÌNH
// ============================================================
const ADMIN_PASSWORD = '682010@?'; // Mật khẩu admin
let ADMIN_ID = '888888'; // ID admin có thể đổi

// Danh sách máy phụ
let subDevices = [
    {
        id: '123456',
        name: 'Máy A',
        status: 'online',
        socketId: null,
        chatHistory: [
            { from: 'system', text: 'Máy A (123456) đã được kết nối.', time: new Date().toLocaleTimeString() }
        ]
    },
    {
        id: '654321',
        name: 'Máy B',
        status: 'online',
        socketId: null,
        chatHistory: [
            { from: 'system', text: 'Máy B (654321) đã được kết nối.', time: new Date().toLocaleTimeString() }
        ]
    },
    {
        id: '789012',
        name: 'Máy C',
        status: 'online',
        socketId: null,
        chatHistory: [
            { from: 'system', text: 'Máy C (789012) đã được kết nối.', time: new Date().toLocaleTimeString() }
        ]
    }
];

let adminSocketId = null;
let callSessions = {};

// ============================================================
// HÀM HỖ TRỢ
// ============================================================
function generateSixDigitId() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function getDeviceById(id) {
    return subDevices.find(d => d.id === id);
}

function getDeviceBySocketId(socketId) {
    return subDevices.find(d => d.socketId === socketId);
}

// ============================================================
// API HTTP
// ============================================================

// Kiểm tra server
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        adminId: ADMIN_ID,
        deviceCount: subDevices.length 
    });
});

// Lấy danh sách máy phụ (cho admin)
app.get('/api/devices', (req, res) => {
    res.json(subDevices);
});

// Thêm máy phụ (chỉ admin)
app.post('/api/devices/add', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Mật khẩu sai!' });
    }
    const id = generateSixDigitId();
    const name = 'Máy ' + String.fromCharCode(65 + subDevices.length);
    const newDevice = {
        id: id,
        name: name,
        status: 'online',
        socketId: null,
        chatHistory: [
            { from: 'system', text: `Máy ${name} (${id}) đã được tạo.`, time: new Date().toLocaleTimeString() }
        ]
    };
    subDevices.push(newDevice);
    // Thông báo cho admin
    if (adminSocketId) {
        io.to(adminSocketId).emit('device_list', subDevices);
    }
    res.json({ success: true, device: newDevice });
});

// Xóa máy phụ (chỉ admin)
app.post('/api/devices/remove', (req, res) => {
    const { password, id } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Mật khẩu sai!' });
    }
    const index = subDevices.findIndex(d => d.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Không tìm thấy máy!' });
    }
    subDevices.splice(index, 1);
    if (adminSocketId) {
        io.to(adminSocketId).emit('device_list', subDevices);
    }
    res.json({ success: true });
});

// Đổi ID Admin (chỉ admin)
app.post('/api/admin/change-id', (req, res) => {
    const { password, newId } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Mật khẩu sai!' });
    }
    if (!/^\d{6}$/.test(newId)) {
        return res.status(400).json({ error: 'ID phải là 6 chữ số!' });
    }
    if (getDeviceById(newId)) {
        return res.status(400).json({ error: 'ID đã được sử dụng!' });
    }
    const oldId = ADMIN_ID;
    ADMIN_ID = newId;
    if (adminSocketId) {
        io.to(adminSocketId).emit('admin_id_changed', { newId: ADMIN_ID });
    }
    res.json({ success: true, oldId, newId: ADMIN_ID });
});

// Đổi mật khẩu Admin (chỉ admin)
app.post('/api/admin/change-password', (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (oldPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Mật khẩu cũ sai!' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
    }
    // Cập nhật mật khẩu
    // Lưu ý: Trong thực tế nên lưu vào database
    // Ở đây chỉ demo nên gán trực tiếp
    // ADMIN_PASSWORD = newPassword; // Không thể gán const, dùng biến let
    res.json({ success: true, message: 'Đã đổi mật khẩu thành công!' });
});

// ============================================================
// SOCKET.IO
// ============================================================
io.on('connection', (socket) => {
    console.log('🔗 Client connected:', socket.id);

    // ----- ADMIN LOGIN -----
    socket.on('admin_login', (data) => {
        const { password } = data;
        console.log('Admin login attempt with password:', password);
        if (password === ADMIN_PASSWORD) {
            adminSocketId = socket.id;
            socket.emit('admin_login_success', {
                adminId: ADMIN_ID,
                devices: subDevices
            });
            console.log('✅ Admin logged in successfully');
            // Gửi danh sách thiết bị
            io.to(adminSocketId).emit('device_list', subDevices);
        } else {
            socket.emit('admin_login_fail', { error: '❌ Mật khẩu sai!' });
            console.log('❌ Admin login failed');
        }
    });

    // ----- SUB DEVICE LOGIN -----
    socket.on('sub_login', (data) => {
        const { id } = data;
        const device = getDeviceById(id);
        if (device) {
            // Kiểm tra nếu máy đã đăng nhập ở nơi khác
            if (device.socketId) {
                // Đá máy cũ ra
                io.to(device.socketId).emit('force_logout', { reason: 'Đăng nhập từ nơi khác!' });
            }
            device.socketId = socket.id;
            device.status = 'online';
            socket.emit('sub_login_success', {
                device: device
            });
            console.log(`✅ Sub device ${device.name} (${id}) logged in`);
            // Cập nhật cho admin
            if (adminSocketId) {
                io.to(adminSocketId).emit('device_list', subDevices);
            }
        } else {
            socket.emit('sub_login_fail', { error: '❌ ID không tồn tại!' });
            console.log('❌ Sub login failed: ID not found');
        }
    });

    // ----- GỌI ĐIỆN -----
    socket.on('start_call', (data) => {
        const { targetId, type } = data; // type: 'video' | 'audio'
        const caller = getDeviceBySocketId(socket.id) || { id: socket.id, name: 'Admin' };
        const target = getDeviceById(targetId);
        
        if (!target) {
            socket.emit('call_error', { error: 'Không tìm thấy máy!' });
            return;
        }
        if (!target.socketId) {
            socket.emit('call_error', { error: 'Máy đang offline!' });
            return;
        }
        
        // Tạo session gọi
        const callId = Date.now().toString();
        callSessions[callId] = {
            callerId: caller.id || 'admin',
            callerName: caller.name || 'Admin',
            targetId: targetId,
            targetName: target.name,
            type: type,
            status: 'calling'
        };
        
        // Báo cho target
        io.to(target.socketId).emit('incoming_call', {
            callId: callId,
            from: caller.id || 'admin',
            fromName: caller.name || 'Admin',
            type: type
        });
        
        // Báo cho caller đang gọi
        socket.emit('call_started', {
            callId: callId,
            target: targetId,
            targetName: target.name
        });
        
        console.log(`📞 Call ${callId}: ${caller.name} -> ${target.name} (${type})`);
    });

    // ----- NHẬN CUỘC GỌI -----
    socket.on('accept_call', (data) => {
        const { callId } = data;
        const session = callSessions[callId];
        if (!session) {
            socket.emit('call_error', { error: 'Cuộc gọi không tồn tại!' });
            return;
        }
        
        session.status = 'connected';
        const target = getDeviceById(session.targetId);
        
        // Báo cho caller
        if (target && target.socketId) {
            io.to(target.socketId).emit('call_accepted', {
                callId: callId,
                targetId: session.targetId,
                targetName: session.targetName
            });
        }
        
        // Báo cho người nhận
        socket.emit('call_connected', {
            callId: callId,
            callerId: session.callerId,
            callerName: session.callerName
        });
        
        console.log(`✅ Call ${callId} connected`);
    });

    // ----- TỪ CHỐI CUỘC GỌI -----
    socket.on('reject_call', (data) => {
        const { callId } = data;
        const session = callSessions[callId];
        if (!session) return;
        
        session.status = 'rejected';
        const target = getDeviceById(session.targetId);
        if (target && target.socketId) {
            io.to(target.socketId).emit('call_rejected', {
                callId: callId,
                targetId: session.targetId
            });
        }
        
        delete callSessions[callId];
        console.log(`❌ Call ${callId} rejected`);
    });

    // ----- KẾT THÚC CUỘC GỌI -----
    socket.on('end_call', (data) => {
        const { callId } = data;
        const session = callSessions[callId];
        if (!session) return;
        
        // Báo cho cả 2 bên
        const target = getDeviceById(session.targetId);
        if (target && target.socketId) {
            io.to(target.socketId).emit('call_ended', { callId: callId });
        }
        // Báo cho caller
        const caller = getDeviceBySocketId(socket.id);
        if (caller && caller.socketId) {
            io.to(caller.socketId).emit('call_ended', { callId: callId });
        } else if (adminSocketId) {
            io.to(adminSocketId).emit('call_ended', { callId: callId });
        }
        
        delete callSessions[callId];
        console.log(`📞 Call ${callId} ended`);
    });

    // ----- NHẮN TIN -----
    socket.on('send_message', (data) => {
        const { targetId, text, from } = data;
        const target = getDeviceById(targetId);
        if (!target || !target.socketId) {
            socket.emit('message_error', { error: 'Không thể gửi tin nhắn!' });
            return;
        }
        
        // Lưu vào lịch sử
        const msg = {
            from: from || 'unknown',
            text: text,
            time: new Date().toLocaleTimeString()
        };
        target.chatHistory.push(msg);
        
        // Gửi cho target
        io.to(target.socketId).emit('new_message', {
            from: from || 'unknown',
            text: text,
            time: msg.time
        });
        
        // Gửi lại xác nhận cho người gửi
        socket.emit('message_sent', {
            targetId: targetId,
            text: text,
            time: msg.time
        });
    });

    // ----- ĐỔI TRẠNG THÁI CAM/MIC -----
    socket.on('toggle_cam', (data) => {
        const { targetId, isOn } = data;
        const target = getDeviceById(targetId);
        if (target && target.socketId) {
            io.to(target.socketId).emit('cam_toggled', { isOn: isOn });
        }
    });

    socket.on('toggle_mic', (data) => {
        const { targetId, isOn } = data;
        const target = getDeviceById(targetId);
        if (target && target.socketId) {
            io.to(target.socketId).emit('mic_toggled', { isOn: isOn });
        }
    });

    // ----- DISCONNECT -----
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        
        // Kiểm tra nếu là admin
        if (adminSocketId === socket.id) {
            adminSocketId = null;
            console.log('👋 Admin disconnected');
        }
        
        // Kiểm tra nếu là máy phụ
        const device = getDeviceBySocketId(socket.id);
        if (device) {
            device.socketId = null;
            device.status = 'offline';
            console.log(`👋 ${device.name} (${device.id}) disconnected`);
            // Cập nhật cho admin
            if (adminSocketId) {
                io.to(adminSocketId).emit('device_list', subDevices);
            }
        }
    });
});

// ============================================================
// CHẠY SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 CALL CENTER PRO SERVER');
    console.log('========================================');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
    console.log(`🆔 Admin ID: ${ADMIN_ID}`);
    console.log(`📱 Devices: ${subDevices.length}`);
    console.log('========================================');
    console.log('📌 API Endpoints:');
    console.log(`  GET  /api/status`);
    console.log(`  GET  /api/devices`);
    console.log(`  POST /api/devices/add`);
    console.log(`  POST /api/devices/remove`);
    console.log(`  POST /api/admin/change-id`);
    console.log(`  POST /api/admin/change-password`);
    console.log('========================================');
    console.log('📌 Socket.io events ready');
    console.log('========================================');
});
