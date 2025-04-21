import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, where, doc, deleteDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  Sun, 
  Plus, 
  Trash2, 
  Download,
  Calendar,
  Building,
  Battery,
  DollarSign,
  Leaf,
  TrendingUp,
  RefreshCw,
  Filter,
  BarChart2
} from 'lucide-react';
import { Card, Title, Text, BarChart, DonutChart, AreaChart, Metric, Flex } from '@tremor/react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BulkImportModal } from '../components/BulkImportModal';
import { GesDashboard } from '../components/GesDashboard';
import { SilmeOnayModal } from '../components/SilmeOnayModal';
import toast from 'react-hot-toast';
import type { GesVerisi, GesDetay } from '../types';

export const UretimVerileri: React.FC = () => {
  const { kullanici } = useAuth();
  const [uretimVerileri, setUretimVerileri] = useState<GesVerisi[]>([]);
  const [santraller, setSantraller] = useState<GesDetay[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [importModalAcik, setImportModalAcik] = useState(false);
  const [secilenSantral, setSecilenSantral] = useState<string>('');
  const [secilenAy, setSecilenAy] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('month');
  const [silinecekVeri, setSilinecekVeri] = useState<string | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [gorunumTipi, setGorunumTipi] = useState<'liste' | 'grafik'>('grafik');

  const canAdd = kullanici?.rol && ['yonetici', 'tekniker', 'muhendis'].includes(kullanici.rol);
  const canDelete = kullanici?.rol === 'yonetici';

  // Yıl seçeneklerini oluştur (son 5 yıl)
  const yilSecenekleri = Array.from({ length: 5 }, (_, i) => {
    const yil = new Date().getFullYear() - i;
    return format(new Date(yil, 0), 'yyyy');
  });

  // Santral bilgilerini getir
  useEffect(() => {
    const santralleriGetir = async () => {
      if (!kullanici) return;

      try {
        let santralQuery;
        if (kullanici.rol === 'musteri' && kullanici.sahalar) {
          if (kullanici.sahalar.length === 0) {
            setSantraller([]);
            setYukleniyor(false);
            return;
          }
          
          santralQuery = query(
            collection(db, 'santraller'),
            where('__name__', 'in', kullanici.sahalar)
          );
        } else {
          santralQuery = query(collection(db, 'santraller'));
        }

        const snapshot = await getDocs(santralQuery);
        const santralVerileri = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GesDetay[];
        
        setSantraller(santralVerileri);
        
        // Eğer santral seçilmemişse ve santral varsa ilk santralı seç
        if (!secilenSantral && santralVerileri.length > 0) {
          setSecilenSantral(santralVerileri[0].id);
        }
      } catch (error) {
        console.error('Santraller getirilemedi:', error);
        toast.error('Santraller yüklenirken bir hata oluştu');
      }
    };

    santralleriGetir();
  }, [kullanici]);

  // Üretim verilerini getir
  useEffect(() => {
    const fetchUretimVerileri = async () => {
      if (!secilenSantral) {
        setUretimVerileri([]);
        setYukleniyor(false);
        return;
      }

      try {
        setYukleniyor(true);
        
        // Changed the query to use where first, then orderBy to match the index
        const uretimQuery = query(
          collection(db, 'uretimVerileri'),
          where('santralId', '==', secilenSantral),
          orderBy('tarih', 'desc')
        );

        const snapshot = await getDocs(uretimQuery);
        let veriler = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GesVerisi[];

        // Tarih filtreleme
        if (dateRange === 'month') {
          const ayBaslangic = startOfMonth(parseISO(secilenAy + '-01'));
          const ayBitis = endOfMonth(parseISO(secilenAy + '-01'));
          
          veriler = veriler.filter(veri => {
            const veriTarihi = veri.tarih.toDate();
            return veriTarihi >= ayBaslangic && veriTarihi <= ayBitis;
          });
        } else if (dateRange === 'week') {
          const birHaftaOnce = new Date();
          birHaftaOnce.setDate(birHaftaOnce.getDate() - 7);
          
          veriler = veriler.filter(veri => {
            return veri.tarih.toDate() >= birHaftaOnce;
          });
        }

        setUretimVerileri(veriler);
      } catch (error) {
        console.error('Üretim verileri getirilemedi:', error);
        toast.error('Üretim verileri yüklenirken bir hata oluştu');
      } finally {
        setYukleniyor(false);
      }
    };

    fetchUretimVerileri();
  }, [secilenSantral, secilenAy, dateRange]);

  const handleVeriSil = async (id: string) => {
    if (!canDelete) {
      toast.error('Bu işlem için yetkiniz yok');
      return;
    }

    try {
      setYukleniyor(true);
      await deleteDoc(doc(db, 'uretimVerileri', id));
      toast.success('Üretim verisi başarıyla silindi');
      setSilinecekVeri(null);
      setUretimVerileri(prev => prev.filter(veri => veri.id !== id));
    } catch (error) {
      console.error('Veri silme hatası:', error);
      toast.error('Veri silinirken bir hata oluştu');
    } finally {
      setYukleniyor(false);
    }
  };

  const handleYenile = async () => {
    setYenileniyor(true);
    
    try {
      if (!secilenSantral) {
        return;
      }
      
      // Changed the query to use where first, then orderBy to match the index
      const uretimQuery = query(
        collection(db, 'uretimVerileri'),
        where('santralId', '==', secilenSantral),
        orderBy('tarih', 'desc')
      );

      const snapshot = await getDocs(uretimQuery);
      let veriler = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GesVerisi[];

      // Tarih filtreleme
      if (dateRange === 'month') {
        const ayBaslangic = startOfMonth(parseISO(secilenAy + '-01'));
        const ayBitis = endOfMonth(parseISO(secilenAy + '-01'));
        
        veriler = veriler.filter(veri => {
          const veriTarihi = veri.tarih.toDate();
          return veriTarihi >= ayBaslangic && veriTarihi <= ayBitis;
        });
      } else if (dateRange === 'week') {
        const birHaftaOnce = new Date();
        birHaftaOnce.setDate(birHaftaOnce.getDate() - 7);
        
        veriler = veriler.filter(veri => {
          return veri.tarih.toDate() >= birHaftaOnce;
        });
      }

      setUretimVerileri(veriler);
      toast.success('Veriler yenilendi');
    } catch (error) {
      console.error('Veri yenileme hatası:', error);
      toast.error('Veriler yenilenirken bir hata oluştu');
    } finally {
      setYenileniyor(false);
    }
  };

  const handleManuelVeriEkle = async () => {
    if (!canAdd || !secilenSantral) {
      toast.error('Bu işlem için yetkiniz yok veya santral seçilmedi');
      return;
    }

    try {
      const secilenSantralDetay = santraller.find(s => s.id === secilenSantral);
      if (!secilenSantralDetay) {
        toast.error('Seçilen santral bulunamadı');
        return;
      }

      const bugun = new Date();
      const gunlukUretim = prompt('Günlük üretim miktarını kWh olarak girin:');
      
      if (!gunlukUretim) return;
      
      const uretimDegeri = parseFloat(gunlukUretim);
      
      if (isNaN(uretimDegeri) || uretimDegeri <= 0) {
        toast.error('Geçerli bir üretim değeri girin');
        return;
      }

      // Gelir hesaplama
      const elektrikBirimFiyati = 2.5; // TL/kWh
      const gelir = uretimDegeri * elektrikBirimFiyati;
      
      // Dağıtım bedeli hesaplama
      const dagitimBedeliOrani = 0.2; // %20
      const dagitimBedeli = gelir * dagitimBedeliOrani;
      
      // Net gelir
      const netGelir = gelir - dagitimBedeli;
      
      // CO2 tasarrufu hesaplama (yaklaşık değer: 0.5 kg CO2/kWh)
      const co2Tasarrufu = uretimDegeri * 0.5;

      // Performans oranı hesaplama
      let performansOrani = 0;
      
      if (secilenSantralDetay.kapasite > 0) {
        // Teorik maksimum günlük üretim (5 saat tam verimli çalışma varsayımı)
        const teorikMaksimum = secilenSantralDetay.kapasite * 5;
        performansOrani = (uretimDegeri / teorikMaksimum) * 100;
      }

      await addDoc(collection(db, 'uretimVerileri'), {
        santralId: secilenSantral,
        tarih: Timestamp.fromDate(bugun),
        gunlukUretim: uretimDegeri,
        anlikGuc: secilenSantralDetay.kapasite || 0,
        performansOrani: performansOrani,
        gelir: netGelir,
        dagitimBedeli: dagitimBedeli,
        tasarrufEdilenCO2: co2Tasarrufu,
        hava: {
          sicaklik: 0,
          nem: 0,
          radyasyon: 0
        },
        olusturanKisi: {
          id: kullanici?.id,
          ad: kullanici?.ad
        },
        olusturmaTarihi: Timestamp.now()
      });

      toast.success('Üretim verisi başarıyla eklendi');
      handleYenile();
    } catch (error) {
      console.error('Veri ekleme hatası:', error);
      toast.error('Veri eklenirken bir hata oluştu');
    }
  };

  const handleRaporIndir = () => {
    try {
      const headers = ['Tarih', 'Günlük Üretim (kWh)', 'Gelir (₺)', 'CO2 Tasarrufu (kg)', 'Performans (%)'];
      const rows = uretimVerileri.map(veri => [
        format(veri.tarih.toDate(), 'dd.MM.yyyy'),
        veri.gunlukUretim.toString(),
        (veri.gelir || 0).toFixed(2),
        (veri.tasarrufEdilenCO2 || 0).toFixed(1),
        (veri.performansOrani || 0).toFixed(1)
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `uretim-raporu-${secilenSantral}-${secilenAy}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success('Rapor başarıyla indirildi');
    } catch (error) {
      console.error('Rapor indirme hatası:', error);
      toast.error('Rapor indirilirken bir hata oluştu');
    }
  };

  if (yukleniyor && santraller.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Üretim Verileri</h1>
          <p className="mt-1 text-sm text-gray-500">
            {kullanici?.rol === 'musteri' 
              ? 'Santrallerinizin üretim verileri'
              : 'Güneş enerjisi santrallerinin üretim verileri'}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleYenile}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            disabled={yenileniyor}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${yenileniyor ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          {canAdd && (
            <>
              <button
                onClick={handleManuelVeriEkle}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Manuel Veri Ekle
              </button>
              <button
                onClick={() => setImportModalAcik(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Toplu İçe Aktar
              </button>
            </>
          )}
        </div>
      </div>

      {santraller.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12">
            <Sun className="h-16 w-16 text-yellow-300 mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Santral Bulunamadı</h3>
            <p className="text-gray-500 text-center max-w-md">
              {kullanici?.rol === 'musteri' 
                ? 'Henüz size atanmış santral bulunmuyor. Lütfen yöneticinizle iletişime geçin.'
                : 'Henüz hiç santral kaydı bulunmuyor. Üretim verilerini görmek için önce bir santral eklemelisiniz.'}
            </p>
            {kullanici?.rol === 'yonetici' && (
              <button
                onClick={() => window.location.href = '/ges-yonetimi'}
                className="mt-6 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Santral Ekle
              </button>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="w-full md:w-1/3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Santral Seçimi</label>
                <select
                  value={secilenSantral}
                  onChange={(e) => setSecilenSantral(e.target.value)}
                  className="rounded-lg border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 w-full"
                >
                  {santraller.map(santral => (
                    <option key={santral.id} value={santral.id}>{santral.ad}</option>
                  ))}
                </select>
              </div>
              
              <div className="w-full md:w-1/3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tarih Aralığı</label>
                <div className="flex rounded-md shadow-sm">
                  <button
                    onClick={() => setDateRange('week')}
                    className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                      dateRange === 'week'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Haftalık
                  </button>
                  <button
                    onClick={() => setDateRange('month')}
                    className={`px-4 py-2 text-sm font-medium border-t border-b ${
                      dateRange === 'month'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Aylık
                  </button>
                  <button
                    onClick={() => setDateRange('year')}
                    className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                      dateRange === 'year'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Yıllık
                  </button>
                </div>
              </div>
              
              <div className="w-full md:w-1/3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Ay Seçimi</label>
                <input
                  type="month"
                  value={secilenAy}
                  onChange={(e) => setSecilenAy(e.target.value)}
                  className="rounded-lg border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 w-full"
                  min={`${yilSecenekleri[yilSecenekleri.length - 1]}-01`}
                  max={`${yilSecenekleri[0]}-12`}
                  disabled={dateRange !== 'month'}
                />
              </div>
            </div>
            
            <div className="flex justify-end mt-4">
              <div className="flex rounded-md shadow-sm">
                <button
                  onClick={() => setGorunumTipi('grafik')}
                  className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                    gorunumTipi === 'grafik'
                      ? 'bg-yellow-50 text-yellow-700 border-yellow-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <BarChart2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setGorunumTipi('liste')}
                  className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                    gorunumTipi === 'liste'
                      ? 'bg-yellow-50 text-yellow-700 border-yellow-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {gorunumTipi === 'grafik' ? (
            <GesDashboard 
              santralId={secilenSantral} 
              dateRange={dateRange}
              secilenAy={secilenAy}
            />
          ) : (
            <Card>
              <div className="flex justify-between items-center mb-4">
                <Title>Üretim Verileri Listesi</Title>
                <button
                  onClick={handleRaporIndir}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  CSV İndir
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tarih
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Günlük Üretim (kWh)
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gelir (₺)
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CO2 Tasarrufu (kg)
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Performans (%)
                      </th>
                      {canDelete && (
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          İşlemler
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {uretimVerileri.length === 0 ? (
                      <tr>
                        <td colSpan={canDelete ? 6 : 5} className="px-6 py-4 text-center text-sm text-gray-500">
                          Bu dönemde üretim verisi bulunmuyor
                        </td>
                      </tr>
                    ) : (
                      uretimVerileri.map((veri) => (
                        <tr key={veri.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(veri.tarih.toDate(), 'dd MMMM yyyy', { locale: tr })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {veri.gunlukUretim.toLocaleString('tr-TR', {maximumFractionDigits: 1})}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(veri.gelir || 0).toLocaleString('tr-TR', {maximumFractionDigits: 2})}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(veri.tasarrufEdilenCO2 || 0).toLocaleString('tr-TR', {maximumFractionDigits: 1})}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            %{(veri.performansOrani || 0).toLocaleString('tr-TR', {maximumFractionDigits: 1})}
                          </td>
                          {canDelete && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => setSilinecekVeri(veri.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {importModalAcik && (
        <BulkImportModal
          onClose={() => setImportModalAcik(false)}
          santralId={secilenSantral}
          santralKapasite={santraller.find(s => s.id === secilenSantral)?.kapasite || 0}
          onSuccess={handleYenile}
        />
      )}

      {silinecekVeri && (
        <SilmeOnayModal
          onConfirm={() => handleVeriSil(silinecekVeri)}
          onCancel={() => setSilinecekVeri(null)}
          mesaj="Bu üretim verisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
        />
      )}
    </div>
  );
};