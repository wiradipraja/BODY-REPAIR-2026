
import React, { useState, useEffect } from 'react';
import { Job, EstimateData, Settings, InventoryItem, EstimateItem, ServiceMasterItem, InsuranceLog } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { Save, Plus, Trash2, Calculator, Printer, Lock, X, MessageSquare, History, Activity } from 'lucide-react';
import { generateEstimationPDF } from '../../utils/pdfGenerator';
import { collection, getDocs, query, orderBy, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, SERVICES_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

interface EstimateEditorProps {
  job: Job;
  ppnPercentage: number;
  insuranceOptions: { name: string; jasa: number; part: number }[];
  onSave: (jobId: string, data: EstimateData, saveType: 'estimate' | 'wo') => Promise<string>;
  onCancel: () => void;
  settings: Settings;
  creatorName: string;
  inventoryItems: InventoryItem[];
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ 
  job, ppnPercentage, insuranceOptions, onSave, onCancel, settings, creatorName, inventoryItems 
}) => {
  const [jasaItems, setJasaItems] = useState<EstimateItem[]>(job.estimateData?.jasaItems || []);
  const [partItems, setPartItems] = useState<EstimateItem[]>(job.estimateData?.partItems || []);
  
  const [discountJasa, setDiscountJasa] = useState(job.estimateData?.discountJasa || 0);
  const [discountPart, setDiscountPart] = useState(job.estimateData?.discountPart || 0);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceMasterList, setServiceMasterList] = useState<ServiceMasterItem[]>([]);

  // Banding SPK / Insurance Negotiation State
  const [newLogNote, setNewLogNote] = useState('');
  const [currentStatus, setCurrentStatus] = useState(job.statusKendaraan);

  const isLocked = job.isClosed;

  useEffect(() => {
      if (!job.estimateData && job.namaAsuransi) {
          const ins = insuranceOptions.find(i => i.name === job.namaAsuransi);
          if (ins) {
              setDiscountJasa(ins.jasa);
              setDiscountPart(ins.part);
          }
      }
      loadServices();
  }, [job.namaAsuransi, insuranceOptions, job.estimateData]);

  const loadServices = async () => {
      try {
          const q = query(collection(db, SERVICES_MASTER_COLLECTION), orderBy('serviceName'));
          const snap = await getDocs(q);
          setServiceMasterList(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceMasterItem)));
      } catch (e) {
          console.error(e);
      }
  };

  const handleAddLog = async () => {
      if (!newLogNote.trim()) return;
      setIsSubmitting(true);
      try {
          const newLog: InsuranceLog = {
              date: new Date().toISOString(),
              user: creatorName,
              note: newLogNote
          };
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              insuranceNegotiationLog: arrayUnion(newLog)
          });
          setNewLogNote('');
          if (!job.insuranceNegotiationLog) job.insuranceNegotiationLog = [];
          job.insuranceNegotiationLog.push(newLog);
      } catch (e) { console.error(e); }
      finally { setIsSubmitting(false); }
  };

  const handleStatusChange = async (val: string) => {
      setCurrentStatus(val);
      setIsSubmitting(true);
      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { statusKendaraan: val, updatedAt: serverTimestamp() });
      } catch (e) { console.error(e); }
      finally { setIsSubmitting(false); }
  };

  const addItem = (type: 'jasa' | 'part') => {
    if (isLocked) return;
    const newItem: EstimateItem = type === 'jasa' ? { name: '', price: 0 } : { name: '', price: 0, qty: 1, number: '' };
    if (type === 'jasa') setJasaItems([...jasaItems, newItem]);
    else setPartItems([...partItems, newItem]);
  };

  const updateItem = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    if (isLocked) return;
    const items = type === 'jasa' ? [...jasaItems] : [...partItems];
    let newItem = { ...items[index], [field]: value };

    if (type === 'jasa' && field === 'number') {
        const inputCode = String(value).toUpperCase().trim();
        newItem.number = inputCode;
        const foundService = serviceMasterList.find(s => s.serviceCode === inputCode);
        if (foundService) {
            newItem.name = foundService.serviceName;
            if (!newItem.price) newItem.price = foundService.basePrice;
            newItem.panelCount = foundService.panelValue;
            newItem.workType = foundService.workType;
        }
    }
    
    if (type === 'jasa' && field === 'name') {
        const inputName = String(value);
        newItem.name = inputName;
        const foundService = serviceMasterList.find(s => s.serviceName === inputName);
        if (foundService) {
            if (foundService.serviceCode) newItem.number = foundService.serviceCode;
            if (!newItem.price) newItem.price = foundService.basePrice;
            newItem.panelCount = foundService.panelValue;
            newItem.workType = foundService.workType;
        }
    }

    if (type === 'part' && field === 'number') {
        const foundPart = inventoryItems.find(inv => inv.code.toUpperCase() === String(value).toUpperCase());
        if (foundPart) {
            newItem.name = foundPart.name;
            newItem.price = foundPart.sellPrice;
            newItem.inventoryId = foundPart.id;
        } else { newItem.inventoryId = undefined; }
    }

    items[index] = newItem;
    type === 'jasa' ? setJasaItems(items) : setPartItems(items);
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    if (isLocked) return;
    type === 'jasa' ? setJasaItems(jasaItems.filter((_, i) => i !== index)) : setPartItems(partItems.filter((_, i) => i !== index));
  };

  const prepareEstimateData = (estimationNumber?: string): EstimateData => {
      const subtotalJasa = jasaItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
      const subtotalPart = partItems.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
      const discountJasaAmount = Math.round((subtotalJasa * discountJasa) / 100);
      const discountPartAmount = Math.round((subtotalPart * discountPart) / 100);
      const dpp = (subtotalJasa - discountJasaAmount) + (subtotalPart - discountPartAmount);
      const ppnAmount = Math.round(dpp * (ppnPercentage / 100));
      const grandTotal = dpp + ppnAmount;

      return {
          estimationNumber: estimationNumber || job.estimateData?.estimationNumber,
          grandTotal,
          jasaItems,
          partItems,
          discountJasa,
          discountPart,
          discountJasaAmount,
          discountPartAmount,
          ppnAmount,
          subtotalJasa,
          subtotalPart,
          estimatorName: creatorName
      };
  };

  const handleSaveAction = async (saveType: 'estimate' | 'wo') => {
      setIsSubmitting(true);
      try {
          const data = prepareEstimateData();
          
          // SMART LOGIC: If Insurance and SA is saving estimate, trigger Pre-Claims stage
          if (job.namaAsuransi !== 'Umum / Pribadi' && saveType === 'estimate') {
              // Automatic status update to next stage in lifecycle
              await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
                  statusKendaraan: 'Tunggu SPK Asuransi',
                  updatedAt: serverTimestamp() 
              });
          }

          await onSave(job.id, data, saveType);
      } catch (e) {
          console.error(e);
      } finally {
          setIsSubmitting(false);
      }
  };

  const totals = prepareEstimateData();

  return (
    <div className="space-y-6">
      {/* DATALISTS */}
      <datalist id="inventory-list">{inventoryItems.map(item => (<option key={item.id} value={item.code}>{item.name} | Stok: {item.stock}</option>))}</datalist>
      <datalist id="service-code-list">{serviceMasterList.filter(s => s.serviceCode).map(item => (<option key={item.id} value={item.serviceCode}>{item.serviceName}</option>))}</datalist>
      <datalist id="service-name-list">{serviceMasterList.map(item => (<option key={item.id} value={item.serviceName}>{item.serviceCode ? `[${item.serviceCode}] ` : ''} Panel: {item.panelValue}</option>))}</datalist>

      {/* HEADER CONTROL AREA */}
      <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-lg"><Activity size={20}/></div>
              <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Update Control Status</p>
                  <select 
                    value={currentStatus} 
                    onChange={e => handleStatusChange(e.target.value)}
                    className="bg-transparent font-black text-indigo-900 border-none focus:ring-0 cursor-pointer p-0"
                  >
                      {settings.statusKendaraanOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
              </div>
          </div>
          {job.namaAsuransi !== 'Umum / Pribadi' && (
              <div className="flex-1 max-w-md">
                  <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newLogNote} 
                        onChange={e => setNewLogNote(e.target.value)}
                        placeholder="Log Negosiasi / Banding SPK..." 
                        className="flex-grow p-2 text-xs border rounded-lg"
                      />
                      <button onClick={handleAddLog} disabled={isSubmitting} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1">
                          <MessageSquare size={14}/> Log
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* HISTORY LOG (Banding SPK Area) */}
      {job.insuranceNegotiationLog && job.insuranceNegotiationLog.length > 0 && (
          <div className="bg-white p-4 rounded-xl border border-gray-200">
              <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-3"><History size={14}/> Histori Negosiasi Asuransi</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                  {job.insuranceNegotiationLog.map((log, i) => (
                      <div key={i} className="text-xs p-2 bg-gray-50 rounded border-l-4 border-indigo-400">
                          <div className="flex justify-between font-bold text-indigo-900 mb-1">
                              <span>{log.user}</span>
                              <span className="opacity-50">{formatDateIndo(log.date)}</span>
                          </div>
                          <p className="text-gray-700 italic">"{log.note}"</p>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {isLocked && (<div className="bg-red-50 p-3 rounded flex items-center gap-2 text-red-700 font-bold"><Lock size={18}/> WO ini terkunci (Closed).</div>)}

      {/* JASA SECTION */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-gray-800">A. Jasa Perbaikan</h4>
              <button onClick={() => addItem('jasa')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded font-bold hover:bg-blue-100 disabled:opacity-50"><Plus size={16}/> Tambah Jasa</button>
          </div>
          <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                  <tr><th className="p-2 w-10">No</th><th className="p-2 w-32">Kode</th><th className="p-2">Nama Pekerjaan</th><th className="p-2 w-40 text-right">Biaya (Rp)</th><th className="p-2 w-10"></th></tr>
              </thead>
              <tbody>
                  {jasaItems.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                          <td className="p-2 text-center text-gray-500">{i+1}</td>
                          <td className="p-2"><input list="service-code-list" type="text" value={item.number || ''} onChange={e => updateItem('jasa', i, 'number', e.target.value)} className="w-full p-1.5 border rounded uppercase font-mono text-xs" placeholder="Kode..." disabled={isLocked}/></td>
                          <td className="p-2"><input list="service-name-list" type="text" value={item.name} onChange={e => updateItem('jasa', i, 'name', e.target.value)} className="w-full p-1.5 border rounded" placeholder="Nama Jasa..." disabled={isLocked}/></td>
                          <td className="p-2"><input type="number" value={item.price} onChange={e => updateItem('jasa', i, 'price', Number(e.target.value))} className="w-full p-1.5 border rounded text-right" disabled={isLocked}/></td>
                          <td className="p-2 text-center"><button onClick={() => removeItem('jasa', i)} disabled={isLocked} className="text-red-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={16}/></button></td>
                      </tr>
                  ))}
              </tbody>
          </table>
          <div className="flex justify-end items-center gap-4 mt-3 bg-gray-50 p-2 rounded">
              <span className="text-sm font-bold text-gray-600">Diskon Jasa (%)</span>
              <input type="number" value={discountJasa} onChange={e => setDiscountJasa(Number(e.target.value))} className="w-16 p-1 border rounded text-center font-bold" disabled={isLocked}/>
              <span className="text-sm font-bold text-gray-800">Subtotal: {formatCurrency(totals.subtotalJasa - totals.discountJasaAmount)}</span>
          </div>
      </div>

      {/* PARTS SECTION */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-gray-800">B. Sparepart & Bahan</h4>
              <button onClick={() => addItem('part')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-orange-50 text-orange-700 px-3 py-1 rounded font-bold hover:bg-orange-100 disabled:opacity-50"><Plus size={16}/> Tambah Part</button>
          </div>
          <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                  <tr><th className="p-2 w-10">No</th><th className="p-2 w-40">Nomor Part (Kode)</th><th className="p-2">Nama Sparepart</th><th className="p-2 w-20 text-center">Qty</th><th className="p-2 w-32 text-right">Harga</th><th className="p-2 w-32 text-right">Total</th><th className="p-2 w-10"></th></tr>
              </thead>
              <tbody>
                  {partItems.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                          <td className="p-2 text-center text-gray-500">{i+1}</td>
                          <td className="p-2"><input list="inventory-list" type="text" value={item.number} onChange={e => updateItem('part', i, 'number', e.target.value)} className="w-full p-1.5 border rounded uppercase font-mono" placeholder="Cari Kode..." disabled={isLocked}/></td>
                          <td className="p-2"><input type="text" value={item.name} onChange={e => updateItem('part', i, 'name', e.target.value)} className="w-full p-1.5 border rounded" disabled={isLocked}/></td>
                          <td className="p-2"><input type="number" value={item.qty} onChange={e => updateItem('part', i, 'qty', Number(e.target.value))} className="w-full p-1.5 border rounded text-center" disabled={isLocked}/></td>
                          <td className="p-2"><input type="number" value={item.price} onChange={e => updateItem('part', i, 'price', Number(e.target.value))} className="w-full p-1.5 border rounded text-right" disabled={isLocked}/></td>
                          <td className="p-2 text-right font-medium">{formatCurrency((item.price || 0) * (item.qty || 1))}</td>
                          <td className="p-2 text-center"><button onClick={() => removeItem('part', i)} disabled={isLocked} className="text-red-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={16}/></button></td>
                      </tr>
                  ))}
              </tbody>
          </table>
          <div className="flex justify-end items-center gap-4 mt-3 bg-gray-50 p-2 rounded">
              <span className="text-sm font-bold text-gray-600">Diskon Part (%)</span>
              <input type="number" value={discountPart} onChange={e => setDiscountPart(Number(e.target.value))} className="w-16 p-1 border rounded text-center font-bold" disabled={isLocked}/>
              <span className="text-sm font-bold text-gray-800">Subtotal: {formatCurrency(totals.subtotalPart - totals.discountPartAmount)}</span>
          </div>
      </div>

      {/* SUMMARY & ACTIONS */}
      <div className="bg-gray-900 text-white p-6 rounded-xl flex flex-col md:flex-row justify-between items-center shadow-lg">
          <div className="flex gap-2"><button onClick={() => generateEstimationPDF(job, prepareEstimateData(), settings, creatorName)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-bold transition-colors"><Printer size={18}/> Cetak Estimasi</button></div>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
              <div className="text-right"><p className="text-xs text-gray-400">PPN ({ppnPercentage}%)</p><p className="font-bold">{formatCurrency(totals.ppnAmount)}</p></div>
              <div className="text-right border-l border-gray-700 pl-6"><p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Grand Total</p><p className="text-3xl font-black text-emerald-400">{formatCurrency(totals.grandTotal)}</p></div>
          </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
          <button onClick={onCancel} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold">Batal / Tutup</button>
          {!isLocked && (
              <>
                  <button onClick={() => handleSaveAction('estimate')} disabled={isSubmitting} className="px-6 py-2.5 border-2 border-indigo-600 text-indigo-700 rounded-lg hover:bg-indigo-50 font-bold transition-colors">Simpan Estimasi</button>
                  <button onClick={() => handleSaveAction('wo')} disabled={isSubmitting} className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-lg transition-transform active:scale-95"><Save size={18}/> {job.woNumber ? 'Update WO' : 'Terbitkan WO'}</button>
              </>
          )}
      </div>
    </div>
  );
};

export default EstimateEditor;
