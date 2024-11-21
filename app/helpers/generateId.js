export function generateEnquiryId() {
  const timestamp = new Date().getTime();
  const randomNum = Math.floor(Math.random() * 100);
  return `ENQ${timestamp}${randomNum}`;
}
export function generateOrderId() {
  const timestamp = new Date().getTime();
  const randomNum = Math.floor(Math.random() * 100);
  return `ORD${timestamp}${randomNum}`;
}
