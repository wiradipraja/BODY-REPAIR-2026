import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION } from '../services/firebase';
import { Job } from '../types';

export const useJobs = (user: any) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(collection(db, JOBS_COLLECTION));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Job));
        
        jobsData.sort((a, b) => {
            const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        setJobs(jobsData);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        setError("Gagal memuat data. Periksa koneksi internet atau izin database.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { jobs, loading, error };
};