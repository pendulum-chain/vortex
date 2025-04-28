export function trimAddress(address: string, trimLength = 6): string {
  const addressLength = address.length;
  return `${address.slice(0, trimLength)}...${address.slice(addressLength - trimLength, addressLength)}`;
}
