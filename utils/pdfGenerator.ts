
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Job, EstimateData, Settings, PurchaseOrder, PurchaseOrderItem } from '../types';
import { formatCurrency, formatDateIndo } from './helpers';

const addHeader = (doc: any, settings: Settings) => {
  const pageWidth = doc.internal.pageSize.width;
  const wsName = settings.workshopName || "MAZDA RANGER BODY & PAINT";
  const wsAddress = settings.workshopAddress || "Jl. Pangeran Antasari No. 12, Jakarta Selatan";
  const wsPhone = settings.workshopPhone || "(021) 750-9999";
  const wsEmail = settings.workshopEmail || "service@mazdaranger.com";

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(44, 62, 80);
  doc.text(wsName, 15, 20);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(wsAddress, 15, 25);
  doc.text(`Telp: ${wsPhone} | Email: ${wsEmail}`, 15, 29);
  
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(15, 34, pageWidth - 15, 34);
};

export const generateEstimationPDF = (job: Job, estimateData: EstimateData, settings: Settings, creatorName?: string) => {
  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  addHeader(doc, settings);

  const isWO = !!job.woNumber;
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(isWO ? "WORK ORDER" : "ESTIMASI BIAYA", pageWidth - 15, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(isWO ? `#${job.woNumber}` : `#${estimateData.estimationNumber || 'DRAFT'}`, pageWidth - 15, 30, { align: 'right' });
  doc.text(formatDateIndo(new Date()), pageWidth - 15, 34, { align: 'right' });

  doc.setFillColor(245, 247, 250);
  doc.rect(15, 40, pageWidth - 30, 28, 'F');
  
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("DATA PELANGGAN", 20, 46);
  doc.setFont("helvetica", "normal");
  doc.text(`Nama: ${job.customerName}`, 20, 52);
  doc.text(`Telp: ${job.customerPhone || '-'}`, 20, 57);
  doc.text(`Asuransi: ${job.namaAsuransi}`, 20, 62);
  
  const rightColX = pageWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.text("DATA KENDARAAN", rightColX, 46);
  doc.setFont("helvetica", "normal");
  doc.text(`No. Polisi: ${job.policeNumber}`, rightColX, 52);
  doc.text(`Merk: ${job.carBrand || 'Mazda'} - ${job.carModel}`, rightColX, 57);
  doc.text(`Warna: ${job.warnaMobil}`, rightColX, 62);
  
  let currentY = 75;
  doc.setFont("helvetica", "bold");
  doc.text("A. JASA PERBAIKAN", 15, currentY);
  autoTable(doc, {
    startY: currentY + 2,
    head: [['No', 'Uraian Pekerjaan', 'Biaya (Rp)']],
    body: estimateData.jasaItems.map((item, idx) => [idx + 1, item.name, formatCurrency(item.price)]),
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' } }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text("B. SPAREPART & BAHAN", 15, currentY);
  autoTable(doc, {
    startY: currentY + 2,
    head: [['No', 'No. Part', 'Nama Sparepart', 'Qty', 'Harga @', 'Total (Rp)']],
    body: estimateData.partItems.map((item, idx) => [idx + 1, item.number || '-', item.name, item.qty || 1, formatCurrency(item.price), formatCurrency((item.price || 0) * (item.qty || 1))]),
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { cellWidth: 15, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  if (currentY > 200) { doc.addPage(); currentY = 20; }
  
  const labelX = pageWidth - 90;
  const valX = pageWidth - 15;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);

  // Rincian Kalkulasi
  doc.text("Total Jasa:", labelX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimateData.discountJasaAmount > 0) {
    doc.text(`Diskon Jasa (${estimateData.discountJasa}%):`, labelX, currentY);
    doc.text(`- ${formatCurrency(estimateData.discountJasaAmount)}`, valX, currentY, { align: 'right' });
    currentY += 5;
  }

  doc.text("Total Sparepart:", labelX, currentY);
  doc.text(formatCurrency(estimateData.subtotalPart), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimateData.discountPartAmount > 0) {
    doc.text(`Diskon Part (${estimateData.discountPart}%):`, labelX, currentY);
    doc.text(`- ${formatCurrency(estimateData.discountPartAmount)}`, valX, currentY, { align: 'right' });
    currentY += 5;
  }

  doc.text(`PPN (${settings.ppnPercentage}%):`, labelX, currentY);
  doc.text(formatCurrency(estimateData.ppnAmount), valX, currentY, { align: 'right' });
  currentY += 7;

  // Grand Total Line
  doc.setDrawColor(200);
  doc.line(labelX, currentY - 4, valX, currentY - 4);
  
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("GRAND TOTAL:", labelX, currentY);
  doc.text(formatCurrency(estimateData.grandTotal), valX, currentY, { align: 'right' });

  const signY = currentY + 30;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Hormat Kami,", 30, signY, {align: 'center'});
  doc.text(`( ${creatorName || 'Admin'} )`, 30, signY + 30, {align: 'center'});
  doc.text("Disetujui Oleh,", pageWidth - 50, signY, {align: 'center'});
  doc.text(`( ${job.customerName} )`, pageWidth - 50, signY + 30, {align: 'center'});

  doc.save(`${isWO ? job.woNumber : (estimateData.estimationNumber || 'ESTIMASI')}_${job.policeNumber}.pdf`);
};

export const generatePurchaseOrderPDF = (po: PurchaseOrder, settings: Settings) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    addHeader(doc, settings);

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PURCHASE ORDER", 15, 48);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const infoX = pageWidth - 80;
    doc.text("No. PO", infoX, 48);
    doc.text(`: ${po.poNumber}`, infoX + 25, 48);
    doc.text("Tanggal", infoX, 53);
    doc.text(`: ${po.createdAt ? formatDateIndo(po.createdAt) : formatDateIndo(new Date())}`, infoX + 25, 53);

    doc.setFont("helvetica", "bold");
    doc.text("VENDOR / SUPPLIER:", 15, 65);
    doc.setFont("helvetica", "normal");
    doc.text(po.supplierName, 15, 70);

    autoTable(doc, {
        startY: 80,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty', 'Harga Satuan', 'Total']],
        body: po.items.map((item, idx) => [idx + 1, item.code, item.brand ? `${item.name} (${item.brand})` : item.name, `${item.qty} ${item.unit}`, formatCurrency(item.price), formatCurrency(item.total)]),
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TOTAL:", pageWidth - 90, finalY);
    doc.text(formatCurrency(po.totalAmount), pageWidth - 15, finalY, { align: 'right' });

    doc.save(`${po.poNumber}.pdf`);
};

export const generateReceivingReportPDF = (po: PurchaseOrder, receivedItems: {item: PurchaseOrderItem, qtyReceivedNow: number}[], settings: Settings, receiverName: string) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    addHeader(doc, settings);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BUKTI SERAH TERIMA BARANG", pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Ref PO: ${po.poNumber}`, 15, 55);
    doc.text(`Supplier: ${po.supplierName}`, 15, 60);
    doc.text(`Penerima: ${receiverName}`, pageWidth - 15, 60, { align: 'right' });

    autoTable(doc, {
        startY: 70,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty Diterima']],
        body: receivedItems.map((entry, idx) => [idx + 1, entry.item.code, entry.item.brand ? `${entry.item.name} (${entry.item.brand})` : entry.item.name, `${entry.qtyReceivedNow} ${entry.item.unit}`]),
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94] }
    });

    doc.save(`BST_${po.poNumber}_${new Date().getTime()}.pdf`);
};
