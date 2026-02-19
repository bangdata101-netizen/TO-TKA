import { supabase } from './supabaseClient';
import { User, Exam, ExamResult, AppSettings, Question, UserRole } from '../types';

// Hardcoded Settings (Since app_settings table is removed in new schema)
const DEFAULT_SETTINGS: AppSettings = {
  appName: 'ASESMEN SMPN 2 GEMPOL',
  themeColor: '#2459a9',
  gradientEndColor: '#60a5fa',
  logoStyle: 'circle',
  schoolLogoUrl: 'https://lh3.googleusercontent.com/d/1om6FjHkWU1GiERCp0zV73widePqQruKF',
  antiCheat: {
    isActive: true,
    freezeDurationSeconds: 15,
    alertText: 'PERINGATAN! Dilarang berpindah aplikasi.',
    enableSound: true
  }
};

export const db = {
  getSettings: async (): Promise<AppSettings> => {
    // Return hardcoded settings as the new schema doesn't include app_settings
    return DEFAULT_SETTINGS;
  },

  updateSettings: async (newSettings: Partial<AppSettings>): Promise<void> => {
    // No-op since we don't have a settings table anymore
    console.log("Settings update requested (Local Only)", newSettings);
  },

  login: async (input: string, password?: string): Promise<User | undefined> => {
    const cleanInput = input.trim();
    
    // 1. HARDCODED ADMIN CHECK (Fallback)
    if (cleanInput === 'admin' && password === 'admin') {
        return {
            id: 'admin-id',
            name: 'Administrator',
            username: 'admin',
            role: UserRole.ADMIN,
            school: 'PUSAT',
            password: 'admin'
        };
    }

    // 2. USER CHECK (Table: students)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('nisn', cleanInput)
      .single();

    if (error || !data) return undefined;

    // Verify Password
    if (data.password !== password) {
        return undefined;
    }

    // Check Status
    if (data.status === 'blocked') {
        alert("Akun diblokir. Hubungi pengawas.");
        return undefined;
    }

    // Update Login Status
    await supabase.from('students').update({ is_login: true, status: 'idle' }).eq('id', data.id);

    return {
        id: data.id,
        name: data.name,
        username: data.nisn,
        role: data.role as UserRole,
        school: data.school, // This effectively holds Class Name now
        nisn: data.nisn,
        password: data.password,
        status: data.status,
        isLogin: data.is_login,
        grade: data.grade || 7
    };
  },

  // Logout (Reset login status)
  logout: async (userId: string): Promise<void> => {
      if(userId !== 'admin-id' && !userId.startsWith('admin')) {
          await supabase.from('students').update({ is_login: false }).eq('id', userId);
      }
  },

  getExams: async (level?: string): Promise<Exam[]> => {
    // Query 'subjects' table
    const { data: subjects, error } = await supabase
        .from('subjects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error || !subjects) {
        console.error("Error fetching subjects:", error);
        return [];
    }

    // For each subject, fetch questions to build the object
    const exams: Exam[] = [];

    for (const sub of subjects) {
        const { data: questions } = await supabase
            .from('questions')
            .select('*')
            .eq('subject_id', sub.id)
            .order('created_at', { ascending: true }); // Ensure order
        
        const mappedQuestions: Question[] = (questions || []).map((q: any) => {
            const rawKey = q.Kunci ? q.Kunci.trim().toUpperCase() : '';
            const qType = (q["Tipe Soal"] as any) || 'PG';
            
            let correctIndex = 0;
            let correctIndices: number[] = [];
            let correctSequence: string[] = [];

            // PARSING LOGIC BERDASARKAN TIPE
            if (qType === 'PG') {
                if (rawKey === 'B') correctIndex = 1;
                else if (rawKey === 'C') correctIndex = 2;
                else if (rawKey === 'D') correctIndex = 3;
                else correctIndex = 0; // Default A
            } 
            else if (qType === 'PG_KOMPLEKS' || qType === 'CHECKLIST') {
                // Expect key like "A,C" or "A, B, D"
                const keys = rawKey.split(',').map((k: string) => k.trim());
                correctIndices = keys.map((k: string) => {
                    if (k === 'B') return 1;
                    if (k === 'C') return 2;
                    if (k === 'D') return 3;
                    return 0; // A
                });
                // Remove duplicates
                correctIndices = [...new Set(correctIndices)].sort();
            }
            else if (qType === 'BENAR_SALAH') {
                // Expect key like "B,S,B,B" (Benar, Salah, Benar, Benar) corresponding to Opt A, B, C, D
                correctSequence = rawKey.split(',').map((k: string) => k.trim());
            }
            
            return {
                id: q.id,
                subjectId: q.subject_id,
                nomor: q.Nomor,
                type: qType,
                text: q.Soal || '',
                imgUrl: q["Url Gambar"] || undefined,
                options: [
                    q["Opsi A"] || '', 
                    q["Opsi B"] || '', 
                    q["Opsi C"] || '', 
                    q["Opsi D"] || ''
                ],
                correctIndex,
                correctIndices,
                correctSequence,
                points: parseInt(q.Bobot || '10')
            };
        });

        // Parse Class/School Access JSONB
        let schoolAccess: string[] = [];
        try {
            if (typeof sub.school_access === 'string') {
                schoolAccess = JSON.parse(sub.school_access);
            } else if (Array.isArray(sub.school_access)) {
                schoolAccess = sub.school_access;
            }
        } catch (e) { schoolAccess = []; }

        exams.push({
            id: sub.id,
            title: sub.name,
            subject: sub.name,
            educationLevel: 'SMP',
            durationMinutes: sub.duration,
            questionCount: sub.question_count,
            token: sub.token,
            isActive: true,
            questions: mappedQuestions,
            examDate: sub.exam_date,
            session: sub.session,
            schoolAccess: schoolAccess
        });
    }

    return exams;
  },

  // Updated to support Full Mapping
  updateExamMapping: async (examId: string, token: string, durationMinutes: number, examDate: string, session: string, schoolAccess: string[]): Promise<void> => {
    await supabase.from('subjects').update({ 
      token: token,
      duration: durationMinutes,
      exam_date: examDate,
      session: session,
      school_access: schoolAccess // Supabase handles array to JSONB auto conversion
    }).eq('id', examId);
  },

  createExam: async (exam: Exam): Promise<void> => {
    const payload = {
        name: exam.title,
        duration: exam.durationMinutes,
        question_count: 0,
        token: exam.token
    };
    await supabase.from('subjects').insert(payload);
  },

  addQuestions: async (examId: string, questions: Question[]): Promise<void> => {
      const payload = questions.map((q, idx) => {
          let keyString = 'A';

          if (q.type === 'PG') {
              const keyMap = ['A', 'B', 'C', 'D'];
              keyString = q.correctIndex !== undefined ? keyMap[q.correctIndex] : 'A';
          } 
          else if (q.type === 'PG_KOMPLEKS') {
              // Convert indices [0, 2] to "A,C"
              const keyMap = ['A', 'B', 'C', 'D'];
              if (q.correctIndices) {
                  keyString = q.correctIndices.map(i => keyMap[i]).join(',');
              }
          }
          else if (q.type === 'BENAR_SALAH') {
              // Array ['B', 'S', 'B'] to "B,S,B"
              if (q.correctSequence) {
                  keyString = q.correctSequence.join(',');
              }
          }

          return {
              subject_id: examId,
              "Nomor": String(idx + 1),
              "Tipe Soal": q.type,
              "Jenis Soal": "UMUM",
              "Soal": q.text,
              "Opsi A": q.options[0] || '',
              "Opsi B": q.options[1] || '',
              "Opsi C": q.options[2] || '',
              "Opsi D": q.options[3] || '',
              "Kunci": keyString,
              "Bobot": String(q.points),
              "Url Gambar": q.imgUrl || ''
          };
      });
      
      const { error } = await supabase.from('questions').insert(payload);
      if (error) throw error;

      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject_id', examId);
      if (count !== null) {
          await supabase.from('subjects').update({ question_count: count }).eq('id', examId);
      }
  },

  submitResult: async (result: ExamResult): Promise<void> => {
    const payload = {
        student_id: result.studentId,
        subject_id: result.examId,
        score: result.score,
        cheating_attempts: result.cheatingAttempts || 0
    };
    await supabase.from('results').insert(payload);
    await supabase.from('students').update({ status: 'finished' }).eq('id', result.studentId);
  },

  getAllResults: async (): Promise<ExamResult[]> => {
    const { data, error } = await supabase
        .from('results')
        .select(`
            id, score, timestamp, cheating_attempts, student_id, subject_id,
            students (name, school),
            subjects (name)
        `)
        .order('timestamp', { ascending: false });

    if (error || !data) return [];
    
    return data.map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.students?.name || 'Unknown',
        examId: r.subject_id,
        examTitle: r.subjects?.name || 'Unknown',
        score: Number(r.score),
        submittedAt: r.timestamp,
        totalQuestions: 0, 
        cheatingAttempts: r.cheating_attempts || 0
    }));
  },

  // Reset Cheating Count
  resetCheatingCount: async (resultId: string): Promise<void> => {
      await supabase.from('results').update({ cheating_attempts: 0 }).eq('id', resultId);
  },

  getUsers: async (): Promise<User[]> => {
    const { data } = await supabase.from('students').select('*').order('school', { ascending: true });
    if (!data) return [];

    return data.map((u: any) => ({
        id: u.id,
        name: u.name,
        username: u.nisn,
        role: u.role as UserRole,
        nisn: u.nisn,
        school: u.school, // Maps to Class Name
        password: u.password,
        status: u.status,
        isLogin: u.is_login,
        grade: u.grade || 7
    }));
  },
  
  importStudents: async (users: User[]): Promise<void> => {
      const payload = users.map(u => ({
          name: u.name,
          nisn: u.nisn || u.username, 
          school: u.school || 'UMUM',
          password: u.password || '12345',
          is_login: false,
          status: 'idle',
          role: 'STUDENT'
      }));
      const { error } = await supabase.from('students').upsert(payload, { onConflict: 'nisn' });
      if (error) throw error;
  },

  addUser: async (user: User): Promise<void> => {
      const payload = {
          name: user.name,
          nisn: user.nisn || user.username,
          school: user.school || 'UMUM',
          password: user.password || '12345',
          is_login: false,
          status: 'idle',
          role: user.role
      };
      const { error } = await supabase.from('students').insert(payload);
      if (error) throw error;
  },

  deleteUser: async (id: string): Promise<void> => {
    await supabase.from('students').delete().eq('id', id);
  },

  resetUserStatus: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ is_login: false, status: 'idle' }).eq('id', userId);
  },

  resetUserPassword: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ password: '12345' }).eq('id', userId);
  }
};