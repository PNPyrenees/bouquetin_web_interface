/**
 * Fait defiler un conteneur juste assez pour rendre tous les elements visibles.
 * Les elements peuvent etre hors du conteneur (dropdown TomSelect monte dans body) :
 * seuls leurs rectangles a l'ecran sont utilises pour calculer le decalage.
 */
export function rendreVisibleDansSidebar(conteneur, ...elements) {
  if (!conteneur) return false;

  const rectangles = elements
    .filter(element => element && element.getClientRects().length > 0)
    .map(element => element.getBoundingClientRect());
  if (rectangles.length === 0) return false;

  const marge = 10;
  const zone = conteneur.getBoundingClientRect();
  const haut = Math.min(...rectangles.map(rect => rect.top));
  const bas = Math.max(...rectangles.map(rect => rect.bottom));
  let decalage = 0;

  if (bas > zone.bottom - marge) {
    decalage = bas - zone.bottom + marge;
  } else if (haut < zone.top + marge) {
    decalage = haut - zone.top - marge;
  }

  if (decalage === 0) return false;
  conteneur.scrollBy({ top: decalage, behavior: 'auto' });
  return true;
}

/** Rend entierement visible un accordéon une fois son contenu deploye. */
export function activerDefilementAccordeons(conteneur) {
  conteneur?.querySelectorAll('details').forEach(details => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      requestAnimationFrame(() => {
        rendreVisibleDansSidebar(conteneur, details);
      });
    });
  });
}
