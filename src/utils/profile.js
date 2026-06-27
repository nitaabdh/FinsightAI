const PROFILE_KEY = (userId) => `finsight_profile_${userId}`;
const PHOTO_KEY   = (userId) => `finsight_photo_${userId}`;

export const getProfile = (userId) => {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY(userId))) || null; }
  catch { return null; }
};

export const saveProfile = (userId, profile) => {
  localStorage.setItem(PROFILE_KEY(userId), JSON.stringify({
    ...profile,
    updatedAt: new Date().toISOString(),
  }));
};

// Foto disimpan terpisah karena base64 bisa besar
export const getPhoto = (userId) => {
  return localStorage.getItem(PHOTO_KEY(userId)) || null;
};

export const savePhoto = (userId, base64) => {
  try {
    localStorage.setItem(PHOTO_KEY(userId), base64);
    return true;
  } catch {
    // localStorage penuh
    return false;
  }
};

export const deletePhoto = (userId) => {
  localStorage.removeItem(PHOTO_KEY(userId));
};

export const buildProfileContext = (profile) => {
  if (!profile) return "";
  const parts = [];
  if (profile.displayName) parts.push(`Nama: ${profile.displayName}`);
  if (profile.profesi)     parts.push(`Profesi/Status: ${profile.profesi}`);
  if (profile.deskripsi)   parts.push(`Tentang saya: ${profile.deskripsi}`);
  if (profile.pendapatan)  parts.push(`Kisaran pendapatan: ${profile.pendapatan}`);
  if (profile.tanggungan)  parts.push(`Tanggungan: ${profile.tanggungan}`);
  if (profile.tujuan)      parts.push(`Tujuan keuangan: ${profile.tujuan}`);
  return parts.length === 0 ? "" : `\n\nProfil Pengguna:\n${parts.join("\n")}`;
};
