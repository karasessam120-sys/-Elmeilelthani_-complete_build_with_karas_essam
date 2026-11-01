import { useState, useEffect } from 'react';
import { isQueuedResult } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/lib/types';
import { BookOpen, CheckCircle, Play, Award, RotateCcw, Timer, ChevronRight } from 'lucide-react';

export default function MemberExams() {
  const { user, updateUser } = useAuth();
  const [exams, setExams] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [activeExam, setActiveExam] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .eq('quiz_type', 'general')
      .order('created_at', { ascending: false });
    if (data) setExams(data as Quiz[]);

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

  const startExam = (exam: Quiz) => {
    setActiveExam(exam);
    setAnswers({});
    setCurrentQ(0);
    setResult(null);
    setTimedOut(false);
    setTimeLeft(exam.duration_minutes * 60);
  };

  useEffect(() => {
    if (!activeExam || result) return;
    if (timeLeft <= 0) {
      setTimedOut(true);
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, activeExam, result]);

  const submitExam = async () => {
    if (!activeExam || !user) return;
    const { data, error } = await supabase.rpc('submit_quiz_attempt', { p_quiz_id: activeExam.id, p_answers: answers });
    if (error || !data) {
      toast('error', error?.message || 'تعذر تسجيل الاختبار. حاول مرة أخرى.');
      return;
    }
    if (isQueuedResult(data)) {
      setActiveExam(null);
      toast('info', 'أنت أوفلاين. إجاباتك اتحفظت وهتتصحح وتتحسب نجومها لما النت يرجع.');
      return;
    }
    const res = data as { score: number; total: number; earned: number; stars: number };
    setResult({ correct: res.score, total: res.total });
    setAttempts((prev) => [...prev, { id: crypto.randomUUID(), quiz_id: activeExam.id, user_id: user.id, score: res.score, total: res.total, answers, created_at: new Date().toISOString() } as QuizAttempt]);
    updateUser({ stars: res.stars });
    if (res.earned > 0) toast('success', `أجبت صحيحاً على ${res.score} من ${res.total}! +${res.earned} نجوم!`);
  };

  const retake = () => {
    setResult(null);
    setAnswers({});
    setCurrentQ(0);
    setTimedOut(false);
    setTimeLeft(activeExam ? activeExam.duration_minutes * 60 : 0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (activeExam && !result && !timedOut) {
    const qs = getQuestions(activeExam);
    const q = qs[currentQ];
    const isLast = currentQ === qs.length - 1;
    const answered = !!answers[`q${currentQ}`];

    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveExam(null)} className="text-gray-400 hover:gold-text text-sm">
            ← العودة للاختبارات
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

        <div className="w-full bg-dark-300 rounded-full h-2 overflow-hidden">
          <div className="gold-gradient h-full rounded-full transition-all" style={{ width: `${((currentQ + 1) / qs.length) * 100}%` }} />
        </div>

        <div className="card-dark p-6">
          <h3 className="font-serif font-semibold gold-text mb-2">{activeExam.title}</h3>
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
                    : 'bg-dark-300 border-gold-300/10 text-gray-300'
                }`}
              >
                صحيح
              </button>
              <button
                onClick={() => setAnswers({ ...answers, [`q${currentQ}`]: 'false' })}
                className={`py-6 rounded-lg border-2 text-lg font-bold transition-all ${
                  answers[`q${currentQ}`] === 'false'
                    ? 'bg-red-900/30 border-red-500 text-red-300'
                    : 'bg-dark-300 border-gold-300/10 text-gray-300'
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
              placeholder="اكتب إجابتك..."
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
                onClick={submitExam}
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

  if (activeExam && timedOut && !result) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
        <div className="card-dark p-6 text-center">
          <Timer className="text-red-400 mx-auto mb-3" size={40} />
          <h3 className="text-xl font-serif font-bold text-red-400 mb-2">انتهى الوقت!</h3>
          <p className="text-gray-400 mb-4">انتهى الوقت المحدد للاختبار. لم يتم تسجيل إجاباتك.</p>
          <button onClick={() => { setActiveExam(null); setTimedOut(false); }} className="btn-outline-gold px-6 py-2.5 rounded-lg">
            العودة للاختبارات
          </button>
        </div>
      </div>
    );
  }

  if (activeExam && result) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
        <div className="card-dark p-8 text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
            result.correct === result.total
              ? 'bg-green-900/30 border-2 border-green-500'
              : result.correct > 0 ? 'bg-gold-300/10 border-2 border-gold-300/40'
              : 'bg-red-900/20 border-2 border-red-500/50'
          }`}>
            <Award className={result.correct === result.total ? 'text-green-400' : 'text-gold-300'} size={40} />
          </div>
          <h3 className="text-2xl font-serif font-bold gold-text mb-2">اكتمل الاختبار!</h3>
          <p className="text-lg text-gray-200">
            النتيجة: <span className="gold-text font-bold">{result.correct}/{result.total}</span>
          </p>
          {result.correct > 0 && (
            <p className="text-sm text-green-400 mt-2">+{result.correct * (activeExam.stars_per_question || 5)} نجوم!</p>
          )}
          <button onClick={retake} className="btn-outline-gold px-6 py-2.5 rounded-lg mt-6 flex items-center justify-center gap-2 text-sm">
            <RotateCcw size={16} />
            حاول مرة أخرى
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">الاختبارات العامة</h1>
        <p className="text-sm text-gray-400 mt-1">اختبارات للمراجعة — بمؤقت ويمكن تكرارها</p>
      </div>

      {exams.length === 0 && (
        <div className="card-dark p-12 text-center">
          <BookOpen className="text-gold-300/30 mx-auto mb-3" size={48} />
          <p className="text-gray-400">لا توجد اختبارات متاحة حالياً. تابعنا قريباً!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exams.map((exam) => {
          const examAttempts = attempts.filter((a) => a.quiz_id === exam.id);
          const bestScore = examAttempts.length > 0
            ? Math.max(...examAttempts.map((a) => a.score))
            : null;
          const qCount = getQuestions(exam).length;

          return (
            <div key={exam.id} className="card-dark p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-200">{exam.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">{qCount} سؤال</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Timer size={14} className="text-gold-300" />
                  <span className="text-gold-300">{exam.duration_minutes} دقيقة</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">{getQuestions(exam)[0].question}</p>
              {bestScore !== null && (
                <span className="text-xs gold-text bg-gold-300/10 px-2 py-1 rounded mb-3 inline-block">
                  الأفضل: {bestScore}/{qCount}
                </span>
              )}
              <button onClick={() => startExam(exam)} className="btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
                <Play size={16} />
                ابدأ الاختبار
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
