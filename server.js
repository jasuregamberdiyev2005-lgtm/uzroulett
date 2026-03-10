// Kerakli kutubxonalarni chaqirib olamiz
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Express app yaratamiz
const app = express();

// HTTP server yaratamiz
const server = http.createServer(app);

// Socket.io ni HTTP serverga ulaymiz
const io = new Server(server);

// public papkadagi fayllarni brauzerga berish uchun
app.use(express.static(path.join(__dirname, "public")));

// Bosh sahifa uchun index.html ni yuboramiz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Hozir navbatda turgan foydalanuvchi
let waitingUser = null;

/**
 * Hamma foydalanuvchilarga online sonini yuboradi
 */
function updateOnlineCount() {
  io.emit("online-count", io.engine.clientsCount);
}

/**
 * Ikki foydalanuvchini bir-biriga ulaydi
 */
function pairUsers(userA, userB) {
  if (!userA || !userB) return;
  if (!userA.connected || !userB.connected) return;

  userA.partnerId = userB.id;
  userB.partnerId = userA.id;

  // Bir tomonga offer boshlash uchun initiator true yuboramiz
  userA.emit("matched", { initiator: true });
  userB.emit("matched", { initiator: false });

  userA.emit("status", "Siz begona foydalanuvchiga ulandingiz.");
  userB.emit("status", "Siz begona foydalanuvchiga ulandingiz.");
}

/**
 * Foydalanuvchiga yangi sherik topadi
 */
function findPartner(socket) {
  if (!socket || !socket.connected) return;

  // O‘zi waitingUser bo‘lib turgan bo‘lsa, qayta qo‘shmaymiz
  if (waitingUser && waitingUser.id === socket.id) {
    return;
  }

  // Agar waitingUser mavjud bo‘lsa, ulab qo‘yamiz
  if (waitingUser && waitingUser.connected) {
    const otherUser = waitingUser;
    waitingUser = null;
    pairUsers(otherUser, socket);
  } else {
    // Aks holda navbatga qo‘yamiz
    waitingUser = socket;
    socket.emit("status", "Yangi foydalanuvchi kutilmoqda...");
  }
}

/**
 * Foydalanuvchi bilan bog‘langan sherikni uzadi
 */
function disconnectPartner(socket) {
  if (!socket || !socket.partnerId) return;

  const partner = io.sockets.sockets.get(socket.partnerId);

  if (partner) {
    partner.partnerId = null;
    partner.emit("partner-left");
    findPartner(partner);
  }

  socket.partnerId = null;
}

// Yangi foydalanuvchi ulanganda
io.on("connection", (socket) => {
  socket.partnerId = null;

  updateOnlineCount();
  findPartner(socket);

  /**
   * Text chat xabari
   */
  socket.on("chat-message", (message) => {
    const text = String(message || "").trim();
    if (!text) return;
    if (!socket.partnerId) return;

    const partner = io.sockets.sockets.get(socket.partnerId);
    if (partner) {
      partner.emit("chat-message", text);
    }
  });

  /**
   * Next stranger tugmasi
   */
  socket.on("next-stranger", () => {
    // Agar o‘zi navbatda turgan bo‘lsa, olib tashlaymiz
    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }

    disconnectPartner(socket);
    findPartner(socket);
  });

  /**
   * WebRTC signallarini sherikka uzatish
   */
  socket.on("signal", (data) => {
    if (!socket.partnerId) return;

    const partner = io.sockets.sockets.get(socket.partnerId);
    if (partner) {
      partner.emit("signal", data);
    }
  });

  /**
   * Foydalanuvchi chiqib ketsa
   */
  socket.on("disconnect", () => {
    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }

    disconnectPartner(socket);
    updateOnlineCount();
  });
});

// Serverni ishga tushiramiz
server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});