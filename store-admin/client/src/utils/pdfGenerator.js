/**
 * orderData: {
 *   order_id,
 *   customer_name,
 *   ordered_at,
 *   total_amount,
 *   details: [{ product_name, size_name, color_name, quantity, unit_price }]
 * }
 */
export const generateInvoicePDF = async (orderData) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const fontResponse = await fetch(`${import.meta.env.BASE_URL}NotoSans-Regular.ttf`);
  if (!fontResponse.ok) throw new Error('Không tải được phông chữ tiếng Việt để tạo hóa đơn.');
  const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
  let fontBinary = '';
  for (let offset = 0; offset < fontBytes.length; offset += 0x8000) {
    fontBinary += String.fromCharCode(...fontBytes.subarray(offset, offset + 0x8000));
  }
  doc.addFileToVFS('NotoSans-Regular.ttf', btoa(fontBinary));
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans', 'normal');

  // Header
  doc.setFontSize(18);
  doc.text('HÓA ĐƠN MUA HÀNG - HUNG FASHION', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Mã đơn hàng: ${orderData.order_id}`, 14, 30);
  doc.text(`Khách hàng: ${orderData.customer_name}`, 14, 36);
  doc.text(`Ngày mua: ${new Date(orderData.ordered_at).toLocaleString('vi-VN')}`, 14, 42);
  const orderStatusLabels = {
    Pending: 'Chờ xử lý', Confirmed: 'Đã xác nhận', Processing: 'Đang xử lý',
    Shipped: 'Đang giao', Delivered: 'Đã giao', Cancelled: 'Đã hủy', Refunded: 'Đã hoàn tiền',
  };
  const paymentStatus = orderData.payment?.status || orderData.payment_status;
  const paymentStatusLabels = {
    Pending: 'Chưa thanh toán', Paid: 'Đã thanh toán', Failed: 'Thất bại', Refunded: 'Đã hoàn tiền',
  };
  doc.text(`Trạng thái đơn hàng: ${orderStatusLabels[orderData.order_status] || orderData.order_status || 'Không rõ'}`, 14, 48);
  doc.setTextColor(paymentStatus === 'Failed' ? 190 : 40, paymentStatus === 'Failed' ? 35 : 40, paymentStatus === 'Failed' ? 35 : 40);
  doc.text(`Trạng thái thanh toán: ${paymentStatusLabels[paymentStatus] || paymentStatus || 'Chưa có thông tin'}`, 14, 54);
  doc.setTextColor(0, 0, 0);

  // Table header
  const tableHeaders = ['Sản phẩm', 'Size', 'Màu', 'SL', 'Đơn giá (VND)'];
  const tableRows = orderData.details.map((d) => [
    d.product_name,
    d.size_name,
    d.color_name,
    d.quantity,
    Number(d.unit_price).toLocaleString(),
  ]);

  // Table body
  autoTable(doc, {
    startY: 64,
    head: [tableHeaders],
    body: tableRows,
    // Only the regular Noto Sans face is embedded. Explicitly keep the table
    // header regular too so AutoTable does not request an unregistered bold face.
    styles: { font: 'NotoSans', fontStyle: 'normal' },
    headStyles: { font: 'NotoSans', fontStyle: 'normal' },
  });

  // Tong tien
  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.text(
    `Tổng tiền: ${Number(orderData.total_amount).toLocaleString('vi-VN')} VND`,
    14,
    finalY
  );

  // Luu file
  doc.save(`HoaDon_${orderData.order_id}.pdf`);
};
