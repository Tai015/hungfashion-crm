import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * orderData: {
 *   order_id,
 *   customer_name,
 *   ordered_at,
 *   total_amount,
 *   details: [{ product_name, size_name, color_name, quantity, unit_price }]
 * }
 */
export const generateInvoicePDF = (orderData) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text('HOA DON MUA HANG - HUNG FASHION', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Ma don hang: ${orderData.order_id}`, 14, 30);
  doc.text(`Khach hang: ${orderData.customer_name}`, 14, 36);
  doc.text(`Ngay mua: ${new Date(orderData.ordered_at).toLocaleString()}`, 14, 42);

  // Table header
  const tableHeaders = ['San pham', 'Size', 'Mau', 'SL', 'Don gia (VND)'];
  const tableRows = orderData.details.map((d) => [
    d.product_name,
    d.size_name,
    d.color_name,
    d.quantity,
    Number(d.unit_price).toLocaleString(),
  ]);

  // Table body
  doc.autoTable({
    startY: 55,
    head: [tableHeaders],
    body: tableRows,
  });

  // Tong tien
  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.text(
    `Tong tien: ${Number(orderData.total_amount).toLocaleString()} VND`,
    14,
    finalY
  );

  // Luu file
  doc.save(`HoaDon_${orderData.order_id}.pdf`);
};