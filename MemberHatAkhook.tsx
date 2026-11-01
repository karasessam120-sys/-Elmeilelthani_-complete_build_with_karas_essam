import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import type { AbsentPeer } from '@/lib/types';
import { Users, Camera, Phone, CheckCircle, Loader2, Heart, User, PhoneCall } from 'lucide-react';

export default function MemberHatAkhook() {
  const { user } = useAuth();
  const [peers, setPeers] = useState<AbsentPeer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<AbsentPeer | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadPeers();
    return () => stopCamera();
  }, []);

  const loadPeers = async () => {
    const { data } = await supabase
      .from('absent_peers')
      .select('*')
      .eq('status', 'absent')
      .order('created_at', { ascending: false });
    if (data) setPeers(data as AbsentPeer[]);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      toast('error', 'لا يمكن الوصول للكاميرا');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCapturedImage(canvas.toDataURL('image/jpeg', 0.7));
      stopCamera();
    }
  };

  const submitUpload = async () => {
    if (!user || !selectedPeer || !capturedImage) return;
    setSubmitting(true);

    const { error } = await supabase.from('hat_akhook_uploads').insert({
      member_id: user.id,
      member_name: user.full_name,
      peer_id: selectedPeer.id,
      peer_name: selectedPeer.name,
      photo_data: capturedImage,
      status: 'pending',
    });

    if (error) {
      toast('error', 'فشل الرفع. حاول مرة أخرى.');
      setSubmitting(false);
      return;
    }

    toast('success', 'تم رفع السيلفي! سيراجع الخادم ويعتمد نقاطك الإضافية.');
    setSelectedPeer(null);
    setCapturedImage('');
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">نظام هات أخوك</h1>
        <p className="text-sm text-gray-400 mt-1">"أخوك يناديك" — أعد الأصدقاء الغائبين</p>
      </div>

      <div className="card-dark p-4 flex items-start gap-3">
        <Heart className="text-gold-300 flex-shrink-0 mt-0.5" size={20} />
        <p className="text-sm text-gray-400">
          أحضر صديقاً غائباً إلى الكنيسة يوم الأحد، والتقط سيلفي مشترك معه في القاعة،
          واكسب نجوم إضافية عند اعتماد الخادم لرفعك!
        </p>
      </div>

      {!selectedPeer && (
        <>
          {peers.length === 0 ? (
            <div className="card-dark p-12 text-center">
              <Users className="text-gold-300/30 mx-auto mb-3" size={48} />
              <p className="text-gray-400">لا يوجد أصدقاء غائبون حالياً. عمل رائع — الجميع حاضر!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {peers.map((peer) => (
                <div key={peer.id} className="card-dark p-5">
                  <div className="flex items-start gap-3 mb-3">
                    {peer.member_photo ? (
                      <img src={peer.member_photo} alt={peer.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 font-bold flex-shrink-0">
                        {peer.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-200 truncate">{peer.name}</h3>
                      <p className="text-xs text-gray-400">{peer.church_class || 'بدون فصل'}</p>
                    </div>
                  </div>
                  {peer.member_phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                      <Phone size={14} className="text-gold-300" />
                      رقم الموبايل: {peer.member_phone}
                    </div>
                  )}
                  {peer.parent_phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      <PhoneCall size={14} className="text-gold-300" />
                      رقم ولي الأمر: {peer.parent_phone}
                    </div>
                  )}
                  {peer.contact_info && !peer.member_phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      <Phone size={14} className="text-gold-300" />
                      {peer.contact_info}
                    </div>
                  )}
                  <button
                    onClick={() => { setSelectedPeer(peer); setCapturedImage(''); }}
                    className="btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
                  >
                    <Camera size={16} />
                    أحضرته معي!
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedPeer && (
        <div className="space-y-4 max-w-lg mx-auto">
          <div className="card-dark p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {selectedPeer.member_photo ? (
                  <img src={selectedPeer.member_photo} alt={selectedPeer.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 font-bold">
                    {selectedPeer.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-400">التقاط سيلفي مشترك مع:</p>
                  <p className="font-semibold gold-text">{selectedPeer.name}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedPeer(null); setCapturedImage(''); stopCamera(); }} className="text-gray-400 hover:text-red-400 text-sm">
                إلغاء
              </button>
            </div>

            {!capturedImage && !cameraActive && (
              <button onClick={startCamera} className="btn-outline-gold w-full py-3 rounded-lg flex items-center justify-center gap-2">
                <Camera size={18} />
                فتح الكاميرا
              </button>
            )}

            {cameraActive && (
              <div>
                <div className="rounded-lg overflow-hidden bg-black mb-3">
                  <video ref={videoRef} autoPlay playsInline className="w-full" />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                <button onClick={capturePhoto} className="btn-gold w-full py-3 rounded-lg flex items-center justify-center gap-2">
                  <Camera size={18} />
                  التقاط سيلفي مشترك
                </button>
              </div>
            )}

            {capturedImage && (
              <div>
                <div className="rounded-lg overflow-hidden bg-black max-w-xs mx-auto mb-3">
                  <img src={capturedImage} alt="سيلفي مشترك" className="w-full" />
                </div>
                <button
                  onClick={submitUpload}
                  disabled={submitting}
                  className="btn-gold w-full py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                  إرسال للاعتماد
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
