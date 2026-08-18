(() => {
  const token = sessionStorage.getItem('bqt_token');
  if (!token) return;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role || payload.sub || 'Utilisateur';
    const initiales = {
      pnp_bqt_reader: 'LC',
      pnp_bqt_writer: 'AD'
    }[role] || role.slice(0, 2).toUpperCase();

    document.getElementById('sessionAvatar').textContent = initiales;
    document.getElementById('userChip').style.display = 'flex';
  } catch {
    // Le traitement normal de la session prendra le relais.
  }
})();
