export function getItemsToDelete(existingItems, updatedItems) {
  return existingItems.filter((item) => !updatedItems.includes(item));
}
