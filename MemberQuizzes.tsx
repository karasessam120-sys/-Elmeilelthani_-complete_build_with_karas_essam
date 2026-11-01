import { useState, useEffect } from 'react';
import { isQueuedResult } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/lib/types';
import { Clock, Lock, CheckCircle, Play, Award, Timer, ChevronRight } from 'lucide-react';

export default function MemberQuizzes() {
  const { user, updateUser } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);

  useEffect(() => {
    loadQuizzes();
  }, []);

  const loadQuizzes = async () => {
    const { data: quizData } = await supabase
      .from('quizzes')
      .select('*')
      .eq('quiz_type', 'moquwte')
      .order('created_at', { ascending: false });
    if (quizData) setQuizzes(quizData as Quiz[]);

    if (user) {
      const { data: attData } = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('user_id', user.id);
      if (attData) setAttempts(attData as QuizAttempt[]);
    }
  };

  const getQuestions = (quiz: Quiz): QuizQuestion[] => {
    if (quiz.questions && quiz.questions.length > 0) return quiz.questions;
    return [{
      question: quiz.question,
      question_type: quiz.question_type,
      options: quiz.options,
      correct_answer: quiz.correct_answer,
    }];
  };

  const hasAttempted = (quizId: string) => attempts.some((a) => a.quiz_id === quizId);
  const getAttempt = (quizId: string) => attempts.find((a) => a.quiz_id === quizId);

  const isExpired = (quiz: Quiz) => new Date(quiz.expiry_date).getTime() < Date.now();

  const startQuiz = (quiz: Quiz) => {
    if (hasAttempted(quiz.id) || isExpired(quiz)) return;
    setActiveQuiz(quiz);
    setAnswers({});
    setCurrentQ(0);
    setSubmitted(false);
    setScore(null);
    setTimeLeft(quiz.duration_minutes * 60);
  };

  useEffect(() => {
    if (!activeQuiz || submitted) return;
    if (timeLeft <= 0) {
      submitQuiz();
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, activeQuiz, submitted]);

  const submitQuiz = async () => {
    if (!activeQuiz || !user) return;
    setSubmitted(true);
    // التصحيح وإضافة النجوم بيحصلوا على السيرفر
    const { data, error } = await supabase.rpc('submit_quiz_attempt', { p_quiz_id: activeQuiz.id, p_answers: answers });
    if (error || !data) {
      setSubmitted(false);
      toast('error', error?.message || 'تعذر تسجيل الاختبار. حاول مرة أخرى.');
      return;
    }
    if (isQueuedResult(data)) {
      setSubmitted(false);
      setActiveQuiz(null);
      toast('info', 'أنت أوفلاين. إجاباتك اتحفظت وهتتصحح وتتحسب نجومها لما النت يرجع.');
      return;
    }
    const res = data as { score: number; total: number; earned: number; stars: number };
    setScore({ correct: res.score, total: res.total });
    setAttempts((prev) => [...prev, { id: crypto.randomUUID(), quiz_id: activeQuiz.id, user_id: user.id, score: res.score, total: res.total, answers, created_at: new Date().toISOString() } as QuizAttempt]);
    updateUser({ stars: res.stars, last_quiz_score: res.score, last_quiz_total: res.total });
    if (res.earned > 0) toast('success', `أجبت صحيحاً على ${res.score} من ${res.total}! +${res.earned} نجوم!`);
    else toast('info', res.score > 0 ? `أجبت صحيحاً على ${res.score} من ${res.total}. النجوم بتتحسب على التحسّن عن أحسن نتيجة قبل كده.` : 'تم تسجيل الاختبار. حظ أوفر في المرة القادمة!');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (activeQuiz && !submitted) {
    const qs = getQuestions(activeQuiz);
    const q = qs[currentQ];
    const isLast = currentQ === qs.length - 1;
    const answered = !!answers[`q${currentQ}`];

    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveQuiz(null)} className="text-gray-400 hover:gold-text text-sm">
            ← خروج من الاختبار
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">سؤال {currentQ + 1} / {qs.length}</span>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              timeLeft < 30 ? 'bg-red-950/40 text-red-400' : 'bg-gold-300/10 text-gold-300'
            }`}>
              <Timer size={18} className="animate-pulse" />
              <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-dark-300 rounded-full h-2 overflow-hidden">
          <div className="gold-gradient h-full rounded-full transition-all" style={{ width: `${((currentQ + 1) / qs.length) * 100}%` }} />
        </div>

        <div className="card-dark p-6">
          <h3 className="font-serif font-semibold gold-text mb-2">{activeQuiz.title}</h3>
          <p className="text-lg text-gray-200 mb-6">{q.question}</p>

          {q.question_type === 'mcq' && (
            <div className="grid grid-cols-1 gap-3">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setAnswers({ ...answers, [`q${currentQ}`]: opt })}
                  className={`px-4 py-3 rounded-lg border text-right transition-all ${
                    answers[`q${currentQ}`] === opt
                      ? 'bg-gold-300/15 border-gold-300 text-gold-200'
                      : 'bg-dark-300 border-gold-300/10 text-gray-300 hover:border-gold-300/30'
                  }`}
                >
                  <span className="text-gold-300 font-bold ml-2">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.question_type === 'truefalse' && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setAnswers({ ...answers, [`q${currentQ}`]: 'true' })}
                className={`py-6 rounded-lg border-2 text-lg font-bold transition-all ${
                  answers[`q${currentQ}`] === 'true'
                    ? 'bg-green-900/30 border-green-500 text-green-300'
                    : 'bg-dark-300 border-gold-300/10 text-gray-300 hover:border-green-500/30'
                }`}
              >
                صحيح
              </button>
              <button
                onClick={() => setAnswers({ ...answers, [`q${currentQ}`]: 'false' })}
                className={`py-6 rounded-lg border-2 text-lg font-bold transition-all ${
                  answers[`q${currentQ}`] === 'false'
                    ? 'bg-red-900/30 border-red-500 text-red-300'
                    : 'bg-dark-300 border-gold-300/10 text-gray-300 hover:border-red-500/30'
                }`}
              >
                خطأ
              </button>
            </div>
          )}

          {q.question_type === 'fillblank' && (
            <input
              type="text"
              value={answers[`q${currentQ}`] || ''}
              onChange={(e) => setAnswers({ ...answers, [`q${currentQ}`]: e.target.value })}
              className="input-dark text-lg"
              placeholder="اكتب إجابتك هنا..."
              autoFocus
            />
          )}

          <div className="flex gap-2 mt-6">
            {!isLast ? (
              <button
                onClick={() => setCurrentQ(currentQ + 1)}
                disabled={!answered}
                className="btn-gold flex-1 py-3 rounded-lg flex items-center justify-center gap-2"
              >
                السؤال التالي <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={submitQuiz}
                disabled={!answered}
                className="btn-gold flex-1 py-3 rounded-lg flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> تسليم الاختبار
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeQuiz && submitted && score) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
        <div className="card-dark p-8 text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
            score.correct === score.total
              ? 'bg-green-900/30 border-2 border-green-500'
              : score.correct > 0 ? 'bg-gold-300/10 border-2 border-gold-300/40'
              : 'bg-red-900/20 border-2 border-red-500/50'
          }`}>
            <Award className={score.correct === score.total ? 'text-green-400' : 'text-gold-300'} size={40} />
          </div>
          <h3 className="text-2xl font-serif font-bold gold-text mb-2">اكتمل الاختبار!</h3>
          <p className="text-lg text-gray-200">
            نتيجتك: <span className="gold-text font-bold">{score.correct}/{score.total}</span>
          </p>
          {score.correct > 0 && (
            <p className="text-sm text-green-400 mt-2">+{score.correct * (activeQuiz.stars_per_question || 10)} نجوم!</p>
          )}
          <button onClick={() => { setActiveQuiz(null); setSubmitted(false); }} className="btn-outline-gold px-6 py-2.5 rounded-lg mt-6">
            العودة للاختبارات
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">اختبارات موقوتة</h1>
        <p className="text-sm text-gray-400 mt-1">اختبارات بمؤقت وسياسة محاولة واحدة فقط</p>
      </div>

      {quizzes.length === 0 && (
        <div className="card-dark p-12 text-center">
          <Clock className="text-gold-300/30 mx-auto mb-3" size={48} />
          <p className="text-gray-400">لا توجد اختبارات متاحة حالياً. تابعنا قريباً!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quizzes.map((quiz) => {
          const attempted = hasAttempted(quiz.id);
          const attempt = getAttempt(quiz.id);
          const expired = isExpired(quiz);
          const locked = attempted || expired;
          const qCount = getQuestions(quiz).length;

          return (
            <div key={quiz.id} className={`card-dark p-5 ${locked ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-200">{quiz.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">{qCount} سؤال</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock size={14} className="text-gold-300" />
                  <span className="text-gold-300">{quiz.duration_minutes} دقيقة</span>
                </div>
              </div>

              <p className="text-sm text-gray-400 mb-4 line-clamp-2">{getQuestions(quiz)[0].question}</p>

              {attempted && attempt && (
                <div className="bg-gold-300/5 border border-gold-300/20 rounded-lg px-3 py-2 mb-3">
                  <p className="text-sm gold-text">
                    لقد أكملت هذا الاختبار. نتيجتك: {attempt.score}/{attempt.total}
                  </p>
                </div>
              )}

              {expired && !attempted && (
                <div className="bg-red-950/20 border border-red-800/20 rounded-lg px-3 py-2 mb-3">
                  <p className="text-sm text-red-400">انتهت صلاحية هذا الاختبار.</p>
                </div>
              )}

              {locked ? (
                <div className="flex items-center justify-center gap-2 text-gray-400 py-2">
                  <Lock size={16} />
                  <span className="text-sm">مقفل</span>
                </div>
              ) : (
                <button
                  onClick={() => startQuiz(quiz)}
                  className="btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  <Play size={16} />
                  ابدأ الاختبار
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
