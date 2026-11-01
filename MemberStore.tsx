import { useState, useEffect } from 'react';
import { isQueuedResult } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import type { Reward } from '@/lib/types';
import { Gift, Star, ShoppingBag } from 'lucide-react';

export default function MemberStore() {
  const { user, updateUser } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    const { data } = await supabase
      .from('rewards')
      .select('*')
      .eq('in_stock', true)
      .order('price_stars', { ascending: true });
    if (data) setRewards(data as Reward[]);
  };

  const redeem = async (reward: Reward) => {
    if (!user) return;
    if (user.stars < reward.price_stars) {
      toast('error', 'لا توجد نجوم كافية لاستبدال هذه الهدية');
      return;
    }
    setLoading(true);
    // الخصم وتسجيل الطلب بيحصلوا على السيرفر مع بعض
    const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: reward.id });
    if (error) {
      toast('error', error.message || 'فشل الاستبدال. حاول مرة أخرى.');
      setLoading(false);
      return;
    }
    if (isQueuedResult(data)) {
      toast('info', 'أنت أوفلاين. طلب الهدية اتحفظ وهيتنفّذ (ويتخصم من النجوم) لما النت يرجع.');
      setLoading(false);
      return;
    }
    updateUser({ stars: Number(data) });
    toast('success', `تم طلب الهدية! تم خصم ${reward.price_stars} نجمة. سيؤكد الخادم التسليم.`);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold gold-text">سوق الهدايا</h1>
          <p className="text-sm text-gray-400 mt-1">استبدل نجومك بالهدايا</p>
        </div>
        <div className="card-dark px-4 py-2 flex items-center gap-2">
          <Star className="text-gold-300" size={20} fill="currentColor" />
          <span className="text-lg font-bold gold-text">{user?.stars || 0}</span>
        </div>
      </div>

      {rewards.length === 0 && (
        <div className="card-dark p-12 text-center">
          <Gift className="text-gold-300/30 mx-auto mb-3" size={48} />
          <p className="text-gray-400">لا توجد هدايا في المتجر حالياً.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((reward) => {
          const canAfford = (user?.stars || 0) >= reward.price_stars;
          return (
            <div key={reward.id} className="card-dark p-5 flex flex-col">
              <div className="w-full h-40 rounded-lg overflow-hidden bg-dark-300 flex items-center justify-center mb-4">
                {reward.image_url ? (
                  <img src={reward.image_url} alt={reward.title} className="w-full h-full object-cover" />
                ) : (
                  <Gift className="text-gold-300/50" size={48} />
                )}
              </div>
              <h3 className="font-semibold text-gray-200 mb-1">{reward.title}</h3>
              <div className="flex items-center gap-1.5 mb-3 flex-1">
                <Star className="text-gold-300" size={16} fill="currentColor" />
                <span className="text-lg font-bold gold-text">{reward.price_stars}</span>
                {reward.quantity != null && <span className="mr-auto rounded-full bg-gold-300/10 px-2 py-0.5 text-xs text-gold-300">متبقي {reward.quantity}</span>}
              </div>
              <button
                onClick={() => redeem(reward)}
                disabled={!canAfford || loading}
                className={canAfford ? 'btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm' : 'btn-outline-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm opacity-50 cursor-not-allowed'}
              >
                <ShoppingBag size={16} />
                {canAfford ? 'طلب الهدية' : 'نجوم غير كافية'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
