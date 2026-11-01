export type UserRole = 'member' | 'servant' | 'admin';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  status: 'active' | 'pending';
  education_stage: string;
  school_year: string;
  church_class: string;
  parent_phone: string;
  home_address: string;
  contact_email?: string | null;
  date_of_birth: string | null;
  stars: number;
  avatar_url: string;
  dream?: string | null;
  attendance_present: number;
  attendance_total: number;
  brought_back_count: number;
  last_quiz_score: number;
  last_quiz_total: number;
  created_at: string;
}

export interface QuizQuestion {
  question: string;
  question_type: 'mcq' | 'truefalse' | 'fillblank';
  options: string[];
  correct_answer: string;
}

export interface Quiz {
  id: string;
  title: string;
  quiz_type: 'moquwte' | 'general';
  question_type: 'mcq' | 'truefalse' | 'fillblank';
  question: string;
  options: string[];
  correct_answer: string;
  questions: QuizQuestion[];
  duration_minutes: number;
  expiry_date: string;
  church_class: string;
  created_by: string;
  stars_per_question: number;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  total: number;
  answers: Record<string, string>;
  created_at: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  image_url: string;
  price_stars: number;
  in_stock: boolean;
  quantity?: number | null;
  created_at: string;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  user_name: string;
  reward_id: string;
  reward_title: string;
  price_stars: number;
  status: 'pending' | 'delivered';
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  user_name: string;
  church_class: string;
  status: 'present' | 'absent';
  gps_lat: number | null;
  gps_lng: number | null;
  face_image: string;
  location_name: string;
  attendance_day: string;
  attendance_time: string;
  attendance_date: string;
  created_at: string;
}

export interface AbsentPeer {
  id: string;
  name: string;
  contact_info: string;
  photo_url: string;
  church_class: string;
  status: 'absent' | 'returned';
  member_phone: string;
  parent_phone: string;
  member_photo: string;
  created_at: string;
}

export interface HatAkhookUpload {
  id: string;
  member_id: string;
  member_name: string;
  peer_id: string;
  peer_name: string;
  photo_data: string;
  status: 'pending' | 'approved';
  created_at: string;
}

export interface Feedback {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  church_class: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
}

export interface PasswordReset {
  id: string;
  username: string;
  status: 'pending' | 'approved';
  created_at: string;
  resolved_at: string | null;
}

export interface VerseOfDay {
  id: string;
  verse_text: string;
  verse_reference: string;
  updated_by: string;
  updated_at: string;
}

export interface ChurchConfig {
  id: string;
  gps_lat: number;
  gps_lng: number;
  gps_radius_meters: number;
  attendance_day: string;
  attendance_start_time: string;
  attendance_end_time: string;
  location_name: string;
  updated_at: string;
}

export interface AIChat {
  id: string;
  user_id: string | null;
  user_message: string;
  ai_response: string;
  created_at: string;
}

export interface Notification {
  id: string;
  target_role: string;
  title: string;
  body: string;
  icon: string;
  created_at: string;
}

export interface VerseSchedule {
  id: string;
  update_hour: number;
  enabled: boolean;
  updated_by: string;
  updated_at: string;
}

export interface StarAdjustment {
  id: string;
  user_id: string;
  user_name: string;
  adjusted_by: string;
  amount: number;
  reason: string;
  created_at: string;
}

export interface ChurchClass {
  id: string;
  name: string;
  created_at: string;
}

export interface EducationStage {
  id: string;
  name: string;
  created_at: string;
}

export type InboxKind = 'welcome' | 'quiz' | 'reward' | 'absent' | 'verse' | 'reset_request' | 'info';
export interface InboxMessage {
  id: string;
  user_id: string;
  kind: InboxKind;
  title: string;
  body: string;
  icon: string;
  created_at: string;
  read_at: string | null;
}
