
import { Timestamp, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db, CASHIER_COLLECTION } from "../services/firebase";

export const formatCurrency = (number: number | undefined) => 
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number || 0);

// Format Plat Nomor (Tanpa Spasi, Uppercase)
export const formatPoliceNumber = (value: string) => {
    return value.replace(/\s/g, '').toUpperCase();
};

// Standardize WA Number to 628xxx format
export const formatWaNumber = (phone: string | undefined): string => {
    if (!phone) return '';
    let cleanNumber = phone.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '62' + cleanNumber.substring(1);
    } else if (cleanNumber.startsWith('8')) {
        cleanNumber = '62' + cleanNumber;
    }
    return cleanNumber;
};

// --- CORE SEQUENCE GENERATOR ---
// Format: PREFIX-YYMM-XXX (3 Digit)
export const generateSequenceNumber = async (prefix: string, collectionName: string, fieldName: string = 'transactionNumber'): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // 24
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 05
    
    // Format Periode: PREFIX-YYMM (Contoh: BKK-2405)
    const periodCode = `${prefix}-${year}${month}`; 

    try {
        // Query untuk mencari nomor terakhir dengan prefix periode yang sama
        const q = query(
            collection(db, collectionName),
            where(fieldName, '>=', periodCode),
            where(fieldName, '<=', periodCode + '\uf8ff'), // Karakter unicode tinggi untuk range string
            orderBy(fieldName, 'desc'),
            limit(1)
        );

        const snapshot = await getDocs(q);
        let nextSequence = 1;

        if (!snapshot.empty) {
            const lastId = snapshot.docs[0].data()[fieldName] as string;
            if (lastId) {
                // Parse: PREFIX-YYMM-XXX -> Ambil bagian XXX
                const parts = lastId.split('-');
                const lastSeqStr = parts[parts.length - 1]; 
                const lastSeqNum = parseInt(lastSeqStr, 10);
                
                if (!isNaN(lastSeqNum)) {
                    nextSequence = lastSeqNum + 1;
                }
            }
        }

        // Return Format: PREFIX-YYMM-001 (3 Digit Padding)
        return `${periodCode}-${nextSequence.toString().padStart(3, '0')}`;
        
    } catch (error) {
        console.error(`Gagal generate ID untuk ${prefix}:`, error);
        // Fallback Emergency
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `${periodCode}-ERR${random}`;
    }
};

/**
 * Helper khusus untuk menentukan Prefix Transaksi Keuangan
 * @param type 'IN' (Masuk) atau 'OUT' (Keluar)
 * @param category Kategori transaksi (untuk mendeteksi Pajak)
 */
export const generateTransactionId = async (type: 'IN' | 'OUT', category: string = ''): Promise<string> => {
    let prefix = '';

    // 1. Cek apakah ini Pajak
    if (category.toLowerCase().includes('pajak') || category.toLowerCase().includes('ppn') || category.toLowerCase().includes('pph')) {
        prefix = 'TAX';
    } 
    // 2. Jika bukan pajak, tentukan BKM atau BKK
    else {
        prefix = type === 'IN' ? 'BKM' : 'BKK';
    }

    return generateSequenceNumber(prefix, CASHIER_COLLECTION, 'transactionNumber');
};

// Deprecated wrapper maintained for backward compatibility but redirected to new logic
export const generateTransactionNumber = (type: 'IN' | 'OUT'): string => {
    console.warn("Sync ID generation is deprecated. Use async generateTransactionId.");
    const prefix = type === 'IN' ? 'BKM' : 'BKK';
    return `${prefix}-TEMP-${Math.floor(Math.random() * 1000)}`;
};

export const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Timestamp || obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(item => cleanObject(item));
  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) newObj[key] = cleanObject(obj[key]);
  });
  return newObj;
};

const resolveToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && date.seconds !== undefined) return new Date(date.seconds * 1000);
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d;
    return null;
};

export const toYyyyMmDd = (date: any): string => {
    const d = resolveToDate(date);
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatDateIndo = (date: any): string => {
    const d = resolveToDate(date);
    if (!d || isNaN(d.getTime())) return '-';
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

export const exportToCsv = (filename: string, rows: any[]) => {
    if (!rows || rows.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }
    const separator = ';';
    const processRow = (row: any[]) => {
        let finalVal = '';
        for (let j = 0; j < row.length; j++) {
            let innerValue = row[j] === null || row[j] === undefined ? '' : row[j].toString();
            if (row[j] instanceof Date) innerValue = row[j].toLocaleString('id-ID');
            let result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0) result = '"' + result + '"';
            if (j > 0) finalVal += separator;
            finalVal += result;
        }
        return finalVal + '\n';
    };
    const headers = Object.keys(rows[0]);
    let csvFile = 'sep=' + separator + '\n';
    csvFile += processRow(headers);
    for (let i = 0; i < rows.length; i++) {
        csvFile += processRow(Object.values(rows[i]));
    }
    const blob = new Blob(['\uFEFF' + csvFile], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
