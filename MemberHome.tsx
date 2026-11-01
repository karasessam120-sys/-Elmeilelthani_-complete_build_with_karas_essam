import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getAIResponse, generateDailyVerse } from '@/lib/ai';
import type { VerseOfDay, AIChat } from '@/lib/types';
import CircularProgress from '@/components/ui/CircularProgress';
import { Star, BookOpen, Award, Send, Sparkles, TrendingUp, Target } from 'lucide-react';

export default function MemberHome() {
  const { user } = useAuth();
  const [verse, setVerse] = useState(generateDailyVerse());
  const [chats, setChats] = useState<AIChat[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const attendancePct = user && user.attendance_total > 0
    ? Math.round((user.attendance_present / user.attendance_total) * 100)
    : 0;
  const quizPct = user && user.last_quiz_total > 0
    ? Math.round((user.last_quiz_score / user.last_quiz_total) * 100)
    : 0;
  const stars = user?.stars || 0;
  const milestoneStep = 50;
  const currentMilestone = Math.floor(stars / milestoneStep) * milestoneStep;
  const nextMilestone = currentMilestone + milestoneStep;
  const milestonePct = Math.min(100, ((stars - currentMilestone) / milestoneStep) * 100);

  // آية اليوم بالعربي: بتتغير كل يوم، وبتتحدّث لو التطبيق فضل مفتوح بعد منتصف الليل
  useEffect(() => {
    const t = window.setInterval(() => setVerse(generateDailyVerse()), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (user) {
      supabase
        .from('ai_chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(20)
        .then(({ data }) => {
          if (data) setChats(data as AIChat[]);
        });
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats]);

  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    const response = getAIResponse(msg);

    const { data } = await supabase
      .from('ai_chats')
      .insert({ user_id: user.id, user_message: msg, ai_response: response })
      .select('*')
      .single();

    if (data) {
      setChats((prev) => [...prev, data as AIChat]);
    }
    setSending(false);
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">
          مرحباً بعودتك، {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-400 mt-1">إليك رحلتك في لمحة سريعة</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-dark p-6 flex flex-col items-center">
          <CircularProgress value={attendancePct} max={100} label="الحضور" sublabel={`${user?.attendance_present}/${user?.attendance_total}`} />
        </div>
        <div className="card-dark p-6 flex flex-col items-center">
          <CircularProgress value={quizPct} max={100} label="إكمال الاختبارات" sublabel={`${user?.last_quiz_score}/${user?.last_quiz_total}`} />
        </div>
        <div className="card-dark p-6 flex flex-col items-center">
          <div className="relative w-[120px] h-[120px] flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gold-300/5 border-2 border-gold-300/20" />
            <Star className="text-gold-300 absolute" size={48} fill="currentColor" />
          </div>
          <span className="text-2xl font-bold gold-text mt-2">{stars}</span>
          <span className="text-sm text-gray-400">إجمالي النجوم</span>
        </div>
      </div>

      {/* Milestone progress */}
      <div className="card-dark p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="text-gold-300" size={20} />
            <h3 className="font-semibold text-gray-200">الهدف القادم</h3>
          </div>
          <span className="text-sm gold-text font-bold">{stars} / {nextMilestone} نجمة</span>
          {currentMilestone > 0 && (
            <span className="text-xs text-gray-400">تم بلوغ {currentMilestone} نجمة!</span>
          )}
        </div>
        <div className="w-full bg-dark-300 rounded-full h-4 overflow-hidden">
          <div
            className="gold-gradient h-full rounded-full transition-all duration-1000"
            style={{ width: `${milestonePct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {milestonePct >= 100
            ? `تم بلوغ هدف ${nextMilestone} نجمة! استبدل نجومك في الماركت.`
            : `باقي ${nextMilestone - stars} نجمة للوصول إلى هدف الـ ${nextMilestone} نجمة!`}
        </p>
      </div>

      {/* Verse of the Day */}
      <div className="card-dark p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 opacity-5">
          <BookOpen size={120} className="text-gold-300" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="text-gold-300" size={20} />
            <h3 className="font-serif font-semibold gold-text">آية اليوم</h3>
          </div>
          <blockquote className="text-lg font-serif italic text-gray-200 leading-relaxed">
            "{verse.text}"
          </blockquote>
          <p className="text-sm gold-text mt-2 font-medium">— {verse.ref}</p>
        </div>
      </div>

      {/* Rafik ElNoor AI Assistant */}
      <div className="card-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center">
            <Sparkles className="text-dark-500" size={16} />
          </div>
          <div>
            <h3 className="font-serif font-semibold gold-text">رفيق النور</h3>
            <p className="text-xs text-gray-400">مساعدك الذكي لدراسة الكتاب المقدس</p>
          </div>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-2">
          {chats.length === 0 && (
            <div className="text-center py-6">
              <Sparkles className="text-gold-300/30 mx-auto mb-2" size={32} />
              <p className="text-sm text-gray-400">
                اسألني عن أي كلمة أو آية صعبة في الكتاب المقدس وسأشرحها لك ببساطة!
              </p>
            </div>
          )}
          {chats.map((chat) => (
            <div key={chat.id} className="space-y-2">
              <div className="flex justify-start">
                <div className="bg-gold-300/10 border border-gold-300/20 rounded-lg px-3 py-2 max-w-[80%]">
                  <p className="text-sm text-gray-200">{chat.user_message}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-dark-300 border border-gold-300/10 rounded-lg px-3 py-2 max-w-[80%]">
                  <p className="text-sm text-gray-300">{chat.ai_response}</p>
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-end">
              <div className="bg-dark-300 border border-gold-300/10 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-400 animate-pulse">رفيق يفكر...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="input-dark flex-1"
            placeholder="اسأل عن كلمة أو آية من الكتاب المقدس..."
          />
          <button onClick={sendMessage} disabled={!input.trim() || sending} className="btn-gold px-4 rounded-lg" aria-label="إرسال">
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Quick stats footer */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-dark p-4 flex items-center gap-3">
          <TrendingUp className="text-gold-300" size={24} />
          <div>
            <p className="text-xs text-gray-400">أعدت من الغياب</p>
            <p className="text-lg font-bold gold-text">{user?.brought_back_count || 0} أصدقاء</p>
          </div>
        </div>
        <div className="card-dark p-4 flex items-center gap-3">
          <Award className="text-gold-300" size={24} />
          <div>
            <p className="text-xs text-gray-400">آخر اختبار</p>
            <p className="text-lg font-bold gold-text">{user?.last_quiz_score || 0}/{user?.last_quiz_total || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
