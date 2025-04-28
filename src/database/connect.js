/**
 * @description Modul untuk mengelola koneksi ke database MongoDB menggunakan Mongoose.
 *              Menyediakan fungsi untuk menginisialisasi koneksi dan menangani
 *              event-event dasar terkait status koneksi (connected, error, disconnected, reconnected).
 *              Juga menangani penutupan koneksi saat proses aplikasi dimatikan (SIGINT).
 * @requires mongoose
 * @requires dotenv (implisit via process.env.NODE_ENV)
 */

const mongoose = require("mongoose");

/**
 * Menginisialisasi koneksi ke database MongoDB menggunakan URI yang diberikan
 * dan opsi koneksi yang direkomendasikan. Mendaftarkan listener untuk event
 * koneksi penting dan menangani penutupan koneksi saat sinyal SIGINT diterima.
 * @function connectDB
 * @param {string} mongoURI - URI koneksi MongoDB yang valid (misalnya, dari environment variable).
 * @returns {Promise<void>} Promise yang resolve jika koneksi awal berhasil dibuat, atau reject jika gagal.
 * @throws {Error} Jika `mongoURI` tidak disediakan atau jika koneksi awal ke MongoDB gagal.
 * @async
 */
const connectDB = async (mongoURI) => {
  if (!mongoURI) {
    throw new Error("[Database] MongoDB URI tidak disediakan.");
  }

  /**
   * Opsi konfigurasi untuk koneksi Mongoose.
   * @const {mongoose.ConnectOptions}
   */
  const options = {
    serverSelectionTimeoutMS: 5000, // Batas waktu pemilihan server (ms)
    socketTimeoutMS: 45000, // Batas waktu operasi socket (ms)
    family: 4, // Prioritaskan IPv4
    autoIndex: process.env.NODE_ENV !== "production", // Hanya buat index otomatis di non-produksi
    retryWrites: true, // Coba lagi operasi tulis yang gagal karena jaringan
    w: "majority", // Tingkat Write Concern (konfirmasi mayoritas di replika set)
  };

  try {
    await mongoose.connect(mongoURI, options);

    mongoose.connection.on("connected", () => {
      console.log("[Database] Terhubung ke MongoDB.");
    });

    mongoose.connection.on("error", (err) => {
      console.error("[Database] MongoDB Connection Error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[Database] Koneksi MongoDB terputus.");
    });

    mongoose.connection.on("reconnected", () => {
      console.info("[Database] Koneksi MongoDB berhasil terhubung kembali.");
    });

    process.on("SIGINT", async () => {
      console.log("[Database] Menerima SIGINT, menutup koneksi MongoDB...");
      await mongoose.connection.close();
      console.log(
        "[Database] Koneksi MongoDB ditutup karena aplikasi berhenti.",
      );
      process.exit(0);
    });
  } catch (err) {
    console.error(
      "[Database] Gagal melakukan koneksi awal ke MongoDB:",
      err.message,
    );

    throw err;
  }
};

module.exports = connectDB;
