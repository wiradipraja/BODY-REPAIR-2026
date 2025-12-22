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
    
    // 1. Remove all non-numeric characters (spaces, dashes, plus signs)
    let cleanNumber = phone.replace(/\D/g, '');

    // 2. Handle '0' prefix
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '62' + cleanNumber.substring(1);
    }
    // 3. Handle if starts with '8' (user forgot 0 or 62)
    else if (cleanNumber.startsWith('8')) {
        cleanNumber = '62' + cleanNumber;
    }

    return cleanNumber;
};

// MASTER SEQUENCE GENERATOR: CODE-YYMM-XXXXX (Flexible Sequence Digit)
// Added paddingLength parameter (default 5 for backward compatibility with Invoice)
export const generateSequenceNumber = async (prefix: string, collectionName: string, fieldName: string = 'transactionNumber', paddingLength: number = 5): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const periodCode = `${prefix}-${year}${month}`; // Contoh: BKK-2405

    try {
        // Query transaksi terakhir pada periode bulan ini dengan kode yang sama
        // Filter: fieldName >= prefix-yymm AND fieldName <= prefix-yymm + char terakhir tinggi
        const q = query(
            collection(db, collectionName),
            where(fieldName, '>=', periodCode),
            where(fieldName, '<=', periodCode + '\uf8ff'),
            orderBy(fieldName, 'desc'),
            limit(1)
        );

        const snapshot = await getDocs(q);
        let nextSequence = 1;

        if (!snapshot.empty) {
            const lastId = snapshot.docs[0].data()[fieldName] as string;
            // Format eksisting: CODE-YYMM-XXXXX
            // Split by '-' and take the last part
            const parts = lastId.split('-');
            if (parts.length === 3) {
                const lastSeqNum = parseInt(parts[2]);
                if (!isNaN(lastSeqNum)) {
                    nextSequence = lastSeqNum + 1;
                }
            }
        }

        // Return format: PREFIX-YYMM-XXXX (Sesuai paddingLength)
        return `${periodCode}-${nextSequence.toString().padStart(paddingLength, '0')}`;
        
    } catch (error) {
        console.error(`Gagal generate sequence ID untuk ${prefix}:`, error);
        // Fallback jika offline/error: Gunakan timestamp agar tetap unik tapi format mirip
        const maxRandom = Math.pow(10, paddingLength);
        const fallbackSeq = Math.floor(Math.random() * maxRandom).toString().padStart(paddingLength, '0');
        return `${periodCode}-ERR${fallbackSeq}`;
    }
};

// Wrapper khusus untuk Kasir (BKM/BKK) - Menggunakan Sequence Generator
// UPDATED: Menggunakan 4 digit sequence sesuai permintaan (BKM-YYMM-XXXX)
export const generateTransactionId = async (type: 'IN' | 'OUT'): Promise<string> => {
    const prefix = type === 'IN' ? 'BKM' : 'BKK';
    // Menggunakan fungsi generator sequence database dengan padding 4 digit
    return generateSequenceNumber(prefix, CASHIER_COLLECTION, 'transactionNumber', 4);
};

// Backward compatibility wrapper (Deprecated Warning)
export const generateTransactionNumber = (type: 'IN' | 'OUT'): string => {
    console.warn("Deprecation Warning: Gunakan generateTransactionId (async) untuk nomor urut yang akurat.");
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = type === 'IN' ? 'BKM' : 'BKK';
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${year}${month}-TEMP${random}`; 
};

// Recursive function to remove undefined values for Firestore
export const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Timestamp || obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanObject(item));
  }

  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      newObj[key] = cleanObject(obj[key]);
    }
  });
  return newObj;
};

// Internal helper to convert any date-like object to a real JS Date
const resolveToDate = (date: any): Date | null => {
    if (!date) return null;
    
    // 1. Handle actual Date object
    if (date instanceof Date) return date;
    
    // 2. Handle Firestore Timestamp Instance
    if (typeof date.toDate === 'function') return date.toDate();
    
    // 3. Handle Plain Object representation of Firestore Timestamp ({seconds, nanoseconds})
    if (typeof date === 'object' && date.seconds !== undefined) {
        return new Date(date.seconds * 1000);
    }
    
    // 4. Handle String or Number (ISO string or Epoch)
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d;

    return null;
};

// Untuk input type="date" value (Format HTML standar harus YYYY-MM-DD)
export const toYyyyMmDd = (date: any): string => {
    const d = resolveToDate(date);
    if (!d || isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
};

// Untuk Tampilan (Display) format Indonesia (dd/mm/yyyy)
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
