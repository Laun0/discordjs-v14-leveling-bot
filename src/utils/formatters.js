/**
 * @description Kumpulan fungsi utilitas untuk memformat data seperti angka dan durasi
 *              menjadi string yang lebih mudah dibaca oleh pengguna.
 */

/**
 * Memformat angka numerik menjadi representasi string yang ringkas
 * dengan menambahkan suffix SI (K, M, B, T, P, E) untuk skala besar.
 * Juga menghapus nol di belakang koma yang tidak perlu.
 *
 * @function formatNumber
 * @param {number|string} num - Angka yang akan diformat. Dapat berupa number atau string yang bisa dikonversi ke number.
 * @param {number} [digits=1] - Jumlah maksimum digit desimal yang diinginkan setelah pembulatan (default: 1).
 * @returns {string} String angka yang sudah diformat dengan suffix jika perlu (misal: "1.5K", "12.3M", "500"), atau "NaN" jika input tidak valid.
 */
function formatNumber(num, digits = 1) {
  const number = Number(num);
  if (isNaN(number)) return "NaN";
  if (number === 0) return "0";

  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "K" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "B" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;

  var item = lookup
    .slice()
    .reverse()
    .find((item) => Math.abs(number) >= item.value);

  return item
    ? (number / item.value).toFixed(digits).replace(rx, "$1") + item.symbol
    : number.toString();
}

/**
 * Mengonversi durasi yang diberikan dalam milidetik menjadi format string
 * yang ringkas dan mudah dibaca (misal: "2d 5h", "1h 30m", "5m 10s", "30s").
 * Hanya menampilkan maksimal dua unit waktu terbesar yang relevan.
 *
 * @function formatDuration
 * @param {number|string} millis - Durasi dalam milidetik. Dapat berupa number atau string yang bisa dikonversi ke number.
 * @param {boolean} [longFormat=false] - Jika `true`, gunakan nama unit waktu penuh (days, hours, minutes, seconds). Jika `false` (default), gunakan singkatan (d, h, m, s).
 * @returns {string} String durasi yang diformat, atau "N/A" jika input tidak valid atau negatif.
 */
function formatDuration(millis, longFormat = false) {
  const numberMillis = Number(millis);
  if (isNaN(numberMillis) || numberMillis < 0) return "N/A";
  if (numberMillis === 0) return longFormat ? "0 seconds" : "0s";

  const seconds = Math.floor((numberMillis / 1000) % 60);
  const minutes = Math.floor((numberMillis / (1000 * 60)) % 60);
  const hours = Math.floor((numberMillis / (1000 * 60 * 60)) % 24);
  const days = Math.floor(numberMillis / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0)
    parts.push(`${days}${longFormat ? (days > 1 ? " days" : " day") : "d"}`);
  if (hours > 0)
    parts.push(
      `${hours}${longFormat ? (hours > 1 ? " hours" : " hour") : "h"}`,
    );
  if (minutes > 0)
    parts.push(
      `${minutes}${longFormat ? (minutes > 1 ? " minutes" : " minute") : "m"}`,
    );

  if (seconds > 0 || parts.length === 0)
    parts.push(
      `${seconds}${longFormat ? (seconds > 1 ? " seconds" : " second") : "s"}`,
    );

  return parts.slice(0, 2).join(" ");
}

/**
 * Mengonversi ukuran byte menjadi format yang mudah dibaca (KB, MB, GB, TB).
 * @param {number} bytes - Jumlah byte.
 * @param {number} [decimals=2] - Jumlah digit desimal yang diinginkan.
 * @returns {string} String ukuran file yang diformat.
 */
function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * @module formatters
 * @description Mengekspor kumpulan fungsi utilitas pemformatan.
 * @property {function} formatNumber - Fungsi untuk memformat angka dengan suffix.
 * @property {function} formatDuration - Fungsi untuk memformat durasi dari milidetik.
 */
module.exports = {
  formatNumber,
  formatDuration,
  formatBytes,
};
