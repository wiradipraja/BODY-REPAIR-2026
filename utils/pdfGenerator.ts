import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Job, EstimateData, Settings, PurchaseOrder, PurchaseOrderItem } from '../types';
import { formatCurrency, formatDateIndo } from './helpers';

// Helper for Header
const addHeader = (doc: any, settings: Settings) => {
  const pageWidth = doc.internal.pageSize.width;
  const wsName = settings.workshopName || "MAZDA RANGER BODY & PAINT";
  const wsAddress = settings.workshopAddress || "Jl. Pangeran Antasari No. 12, Jakarta Selatan";
  const wsPhone = settings.workshopPhone || "(021) 750-9999";
  const wsEmail = settings.workshopEmail || "service@mazdaranger.com";

  doc.setFontSize(18);
  doc.setTextColor(40, 40, 100);
  doc.text(wsName, 15, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(wsAddress, 15, 26);
  doc.text(`Telp: ${wsPhone} | Email: ${wsEmail}`, 15, 31);
  
  doc.setDrawColor(200);
  doc.line(15, 35, pageWidth - 15, 35);
};

export const generateEstimationPDF = (job: Job, estimateData: EstimateData, settings: Settings, creatorName?: string) => {
  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  addHeader(doc, settings);

  // --- TITLE & NUMBER ---
  const isWO = !!job.woNumber;
  
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(isWO ? "WORK ORDER (PERINTAH KERJA)" : "ESTIMASI BIAYA PERBAIKAN", pageWidth / 2, 45, { align: 'center' });
  
  doc.setFontSize(11);
  if (isWO) {
      doc.text(`No. WO: ${job.woNumber}`, pageWidth - 15, 45, { align: 'right' });
  } else {
      doc.text(`No. Estimasi: ${estimateData.estimationNumber || 'DRAFT'}`, pageWidth - 15, 45, { align: 'right' });
  }
  
  doc.setFontSize(10);
  doc.text(`Tanggal: ${formatDateIndo(new Date())}`, pageWidth - 15, 50, { align: 'right' });

  // --- CUSTOMER & VEHICLE INFO ---
  const startY = 55;
  
  // Kolom Kiri (Customer)
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DATA PELANGGAN", 15, startY);
  doc.setFont("helvetica", "normal");
  doc.text(`Nama: ${job.customerName}`, 15, startY + 5);
  doc.text(`Telp: ${job.customerPhone || '-'}`, 15, startY + 10);
  doc.text(`Asuransi: ${job.namaAsuransi}`, 15, startY + 15);
  
  // Kolom Kanan (Vehicle)
  const rightColX = pageWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.text("DATA KENDARAAN", rightColX, startY);
  doc.setFont("helvetica", "normal");
  doc.text(`No. Polisi: ${job.policeNumber}`, rightColX, startY + 5);
  doc.text(`Merk/Model: ${job.carBrand || 'Mazda'} - ${job.carModel}`, rightColX, startY + 10);
  doc.text(`Warna: ${job.warnaMobil}`, rightColX, startY + 15);
  
  // --- TABLE JASA ---
  let currentY = startY + 25;
  
  doc.setFont("helvetica", "bold");
  doc.text("A. JASA PERBAIKAN", 15, currentY);
  currentY += 2;
  
  const jasaRows = estimateData.jasaItems.map((item, index) => [
    index + 1,
    item.name,
    formatCurrency(item.price)
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Uraian Pekerjaan', 'Biaya (Rp)']],
    body: jasaRows,
    theme: 'striped',
    headStyles: { fillColor: [63, 81, 181] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 10;

  // --- TABLE PARTS ---
  doc.setFont("helvetica", "bold");
  doc.text("B. SPAREPART & BAHAN", 15, currentY);
  currentY += 2;

  const partRows = estimateData.partItems.map((item, index) => [
    index + 1,
    item.number || '-',
    item.name,
    item.qty || 1,
    formatCurrency(item.price),
    formatCurrency((item.price || 0) * (item.qty || 1))
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'No. Part', 'Nama Sparepart', 'Qty', 'Harga @', 'Total (Rp)']],
    body: partRows,
    theme: 'striped',
    headStyles: { fillColor: [233, 88, 28] }, // Orange theme for parts
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 10;

  // --- SUMMARY CALCULATION ---
  // Pastikan tidak nabrak halaman bawah
  if (currentY > 230) {
      doc.addPage();
      currentY = 20;
  }

  const summaryX = pageWidth - 90;
  const valX = pageWidth - 15;
  
  doc.setFont("helvetica", "normal");
  
  // Subtotal Jasa
  doc.text("Subtotal Jasa:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa), valX, currentY, { align: 'right' });
  currentY += 5;
  
  // Disc Jasa
  if (estimateData.discountJasa > 0) {
      doc.text(`Diskon Jasa (${estimateData.discountJasa}%):`, summaryX, currentY);
      doc.text(`(${formatCurrency(estimateData.discountJasaAmount)})`, valX, currentY, { align: 'right' });
      currentY += 5;
  }

  // Subtotal Part
  doc.text("Subtotal Part:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalPart), valX, currentY, { align: 'right' });
  currentY += 5;

  // Disc Part
  if (estimateData.discountPart > 0) {
      doc.text(`Diskon Part (${estimateData.discountPart}%):`, summaryX, currentY);
      doc.text(`(${formatCurrency(estimateData.discountPartAmount)})`, valX, currentY, { align: 'right' });
      currentY += 5;
  }

  // Line
  doc.line(summaryX, currentY, valX, currentY);
  currentY += 5;

  // DPP
  doc.setFont("helvetica", "bold");
  doc.text("DPP (Dasar Pengenaan Pajak):", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa + estimateData.subtotalPart - estimateData.discountJasaAmount - estimateData.discountPartAmount), valX, currentY, { align: 'right' });
  currentY += 6;

  // PPN
  doc.text(`PPN (${settings.ppnPercentage}%):`, summaryX, currentY);
  doc.text(formatCurrency(estimateData.ppnAmount), valX, currentY, { align: 'right' });
  currentY += 7;

  // GRAND TOTAL
  doc.setFontSize(12);
  doc.setFillColor(240, 240, 240);
  doc.rect(summaryX - 2, currentY - 5, 90, 10, 'F');
  doc.text("GRAND TOTAL:", summaryX, currentY + 1);
  doc.text(formatCurrency(estimateData.grandTotal), valX, currentY + 1, { align: 'right' });

  // --- FOOTER / SIGNATURE (MODIFIED) ---
  const signY = currentY + 30;
  if (signY < 270) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      // Left Signature (SA/Admin - Now uses Creator Name)
      const col1 = 30;
      doc.text("Hormat Kami,", col1, signY, {align: 'center'});
      doc.text(`( ${creatorName || 'Admin'} )`, col1, signY + 25, {align: 'center'});

      // Right Signature (Customer)
      const col3 = pageWidth - 50;
      doc.text("Disetujui Oleh,", col3, signY, {align: 'center'});
      doc.text(`( ${job.customerName} )`, col3, signY + 25, {align: 'center'});
  }

  // Filename: WO... or BE...
  const fileName = `${isWO ? job.woNumber : (estimateData.estimationNumber || 'ESTIMASI')}_${job.policeNumber}.pdf`;
  doc.save(fileName);
};

// --- NEW: GENERATE PO OFFICIAL PDF ---
export const generatePurchaseOrderPDF = (po: PurchaseOrder, settings: Settings) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    addHeader(doc, settings);

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PURCHASE ORDER (PO)", pageWidth / 2, 45, { align: 'center' });

    // PO Info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Left: Supplier Info
    doc.text("Kepada Yth:", 15, 60);
    doc.setFont("helvetica", "bold");
    doc.text(po.supplierName, 15, 65);
    doc.setFont("helvetica", "normal");
    
    // Right: PO Details
    const rightX = pageWidth - 70;
    doc.text(`No. PO`, rightX, 60);
    doc.text(`: ${po.poNumber}`, rightX + 25, 60);
    
    doc.text(`Tanggal`, rightX, 65);
    doc.text(`: ${formatDateIndo(po.createdAt)}`, rightX + 25, 65);
    
    doc.text(`Dibuat Oleh`, rightX, 70);
    doc.text(`: ${po.createdBy || 'Admin'}`, rightX + 25, 70);

    // Table Items
    const tableBody = po.items.map((item, idx) => [
        idx + 1,
        item.code,
        item.name,
        `${item.qty} ${item.unit}`,
        formatCurrency(item.price),
        formatCurrency(item.total)
    ]);

    autoTable(doc, {
        startY: 80,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty', 'Harga Satuan', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80] },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right' }
        },
        foot: [
            ['', '', '', '', 'Subtotal', formatCurrency(po.subtotal)],
            po.hasPpn ? ['', '', '', '', 'PPN (11%)', formatCurrency(po.ppnAmount)] : null,
            ['', '', '', '', 'GRAND TOTAL', formatCurrency(po.totalAmount)]
        ].filter(Boolean) as any
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    // Notes
    if(po.notes) {
        doc.setFontSize(9);
        doc.text("Catatan:", 15, finalY);
        doc.text(po.notes, 15, finalY + 5);
        finalY += 15;
    }

    // Signatures
    const signY = finalY + 10;
    
    doc.setFontSize(10);
    doc.text("Dibuat Oleh,", 30, signY, {align: 'center'});
    doc.text("( Partman / Staff )", 30, signY + 25, {align: 'center'});

    doc.text("Disetujui Oleh,", pageWidth - 40, signY, {align: 'center'});
    doc.text("( Manager )", pageWidth - 40, signY + 25, {align: 'center'});

    doc.save(`${po.poNumber}.pdf`);
};

// --- NEW: GENERATE RECEIVING REPORT (BUKTI SERAH TERIMA) ---
export const generateReceivingReportPDF = (
    po: PurchaseOrder, 
    receivedItems: {item: PurchaseOrderItem, qtyReceivedNow: number}[], 
    settings: Settings,
    receiverName: string
) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    addHeader(doc, settings);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BUKTI SERAH TERIMA BARANG (GR)", pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Ref PO: ${po.poNumber}`, 15, 55);
    doc.text(`Supplier: ${po.supplierName}`, 15, 60);
    doc.text(`Tanggal Terima: ${formatDateIndo(new Date())}`, pageWidth - 15, 55, { align: 'right' });
    doc.text(`Penerima: ${receiverName}`, pageWidth - 15, 60, { align: 'right' });

    const tableBody = receivedItems.map((entry, idx) => [
        idx + 1,
        entry.item.code,
        entry.item.name,
        `${entry.qtyReceivedNow} ${entry.item.unit}`
    ]);

    autoTable(doc, {
        startY: 70,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty Diterima']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [46, 125, 50] }, // Green theme for receiving
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            3: { cellWidth: 30, halign: 'center' }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 20;

    doc.setFontSize(10);
    doc.text("Diserahkan Oleh,", 30, finalY, {align: 'center'});
    doc.text("( Supplier / Kurir )", 30, finalY + 25, {align: 'center'});

    doc.text("Diterima Oleh,", pageWidth - 40, finalY, {align: 'center'});
    doc.text(`( ${receiverName} )`, pageWidth - 40, finalY + 25, {align: 'center'});

    doc.save(`GR_${po.poNumber}_${new Date().getTime()}.pdf`);
};