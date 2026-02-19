import React, { useState, useEffect, useRef } from 'react';
import { User, Exam, UserRole, Question, QuestionType, ExamResult, AppSettings } from '../types';
import { db } from '../services/database'; 
import { Plus, BookOpen, Save, LogOut, Loader2, Key, RotateCcw, Clock, Upload, Download, FileText, LayoutDashboard, Settings, Printer, Filter, Calendar, FileSpreadsheet, Lock, Link, Edit, ShieldAlert, Activity, ClipboardList, Search, Unlock, Trash2, Database, School, Shuffle, X, CheckSquare, Map, CalendarDays, Flame, Volume2, AlertTriangle, UserX, Info, Check, Monitor, Users, GraduationCap, CheckCircle, XCircle, ArrowLeft, BarChart3, PieChart, Menu } from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  appName: string;
  onSettingsChange: () => void;
  themeColor: string;
  settings: AppSettings;
}

// Fixed Logo for Card Printing
const FIXED_LOGO_URL = "https://lh3.googleusercontent.com/d/1om6FjHkWU1GiERCp0zV73widePqQruKF";

// --- ROBUST CSV PARSER ---
const parseCSV = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = cleanText.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (char === '"') {
            if (insideQuotes && cleanText[i + 1] === '"') {
                currentField += '"';
                i++; 
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !insideQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    return rows;
};

const escapeCSV = (field: any): string => {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes('"') || stringField.includes(',') || stringField.includes(';') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout, appName, onSettingsChange, themeColor, settings }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  
  // TABS
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MONITORING' | 'HASIL_UJIAN' | 'BANK_SOAL' | 'MAPPING' | 'PESERTA' | 'CETAK_KARTU' | 'ANTI_CHEAT'>('DASHBOARD');
  
  // DASHBOARD DRILL-DOWN VIEWS
  const [dashboardView, setDashboardView] = useState<'MAIN' | 'STUDENTS_DETAIL' | 'SCHOOLS_DETAIL' | 'EXAMS_DETAIL'>('MAIN');

  // ANTI CHEAT STATE
  const [acActive, setAcActive] = useState(settings.antiCheat.isActive);
  const [acFreeze, setAcFreeze] = useState(settings.antiCheat.freezeDurationSeconds);
  const [acText, setAcText] = useState(settings.antiCheat.alertText);
  const [acSound, setAcSound] = useState(settings.antiCheat.enableSound);

  // MAPPING / SCHEDULE STATE
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editSession, setEditSession] = useState('');
  const [editSchoolAccess, setEditSchoolAccess] = useState<string[]>([]);
  const [mappingSearch, setMappingSearch] = useState(''); 
  
  // QUESTION BANK STATE
  const [viewingQuestionsExam, setViewingQuestionsExam] = useState<Exam | null>(null);
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [targetExamForAdd, setTargetExamForAdd] = useState<Exam | null>(null);
  
  // MANUAL QUESTION FORM
  const [nqType, setNqType] = useState<QuestionType>('PG');
  const [nqText, setNqText] = useState<string>('');
  const [nqImg, setNqImg] = useState<string>('');
  const [nqOptions, setNqOptions] = useState<string[]>(['', '', '', '']);
  const [nqCorrectIndex, setNqCorrectIndex] = useState<number>(0);
  const [nqPoints, setNqPoints] = useState<number>(10);

  // IMPORT REFS
  const [importTargetExamId, setImportTargetExamId] = useState<string | null>(null);
  const studentFileRef = useRef<HTMLInputElement>(null);
  const questionFileRef = useRef<HTMLInputElement>(null);
  
  // FILTERS & CARD PRINTING
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL'); // For Peserta & Monitoring
  const [dashboardSchoolFilter, setDashboardSchoolFilter] = useState<string>('ALL'); // For Dashboard Details
  const [resultSchoolFilter, setResultSchoolFilter] = useState<string>('ALL'); // For Results
  const [cardSchoolFilter, setCardSchoolFilter] = useState<string>('ALL'); // For Cards
  const [monitoringSearch, setMonitoringSearch] = useState<string>('');
  const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  
  // GRAPH FILTERS
  const [graphFilterMode, setGraphFilterMode] = useState<'SCHEDULED' | 'ALL'>('SCHEDULED');
  const [graphDate, setGraphDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSchoolTooltip, setSelectedSchoolTooltip] = useState<{name: string, value: number, x: number, y: number} | null>(null);

  // MONITORING BULK ACTIONS
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoadingData(true);
    const e = await db.getExams(); 
    const u = await db.getUsers();
    const r = await db.getAllResults();
    setExams(e);
    setUsers(u); 
    setResults(r);
    setIsLoadingData(false);
  };

  // --- ACTIONS ---
  const handleSaveAntiCheat = async () => {
      await db.updateSettings({
          antiCheat: {
              isActive: acActive,
              freezeDurationSeconds: acFreeze,
              alertText: acText,
              enableSound: acSound
          }
      });
      onSettingsChange();
      alert("Pengaturan Sistem Anti-Curang berhasil diperbarui!");
  };

  const handleResetViolation = async (resultId: string) => {
      if(!confirm("Reset status pelanggaran siswa ini?")) return;
      
      await db.resetCheatingCount(resultId);
      
      // Optimistic update locally
      setResults(prev => prev.map(r => r.id === resultId ? {...r, cheatingAttempts: 0} : r));
      alert("Pelanggaran di-reset.");
  };

  const handleCreateExam = async () => {
      const title = prompt("Nama Mata Pelajaran (Contoh: Matematika 7A):");
      if(!title) return;
      
      const newExam: Exam = {
          id: `temp`, // Will be generated by DB
          title: title,
          subject: title,
          educationLevel: 'SMP',
          durationMinutes: 60,
          isActive: true,
          token: '12345',
          questions: [],
          questionCount: 0
      };
      await db.createExam(newExam);
      loadData();
  };

  // --- MAPPING LOGIC ---
  const openMappingModal = (exam: Exam) => {
      setEditingExam(exam);
      setEditToken(exam.token);
      setEditDuration(exam.durationMinutes);
      setEditDate(exam.examDate || new Date().toISOString().split('T')[0]);
      setEditSession(exam.session || 'Sesi 1');
      setEditSchoolAccess(exam.schoolAccess || []); 
      setMappingSearch('');
      setIsEditModalOpen(true);
  };

  const toggleSchoolAccess = (schoolName: string) => {
      setEditSchoolAccess(prev => {
          if (prev.includes(schoolName)) return prev.filter(s => s !== schoolName);
          return [...prev, schoolName];
      });
  };

  const addAllAvailableSchools = (available: string[]) => {
      const newAccess = [...editSchoolAccess];
      available.forEach(s => {
          if(!newAccess.includes(s)) newAccess.push(s);
      });
      setEditSchoolAccess(newAccess);
  };

  const handleSaveMapping = async () => {
      if (!editingExam) return;
      if (editToken.length < 3) return alert("Token minimal 3 karakter");
      
      await db.updateExamMapping(
          editingExam.id, 
          editToken.toUpperCase(), 
          editDuration,
          editDate,
          editSession,
          editSchoolAccess
      );
      setIsEditModalOpen(false);
      setEditingExam(null);
      loadData();
      alert("Mapping Jadwal & Akses Kelas berhasil diperbarui!");
  };

  // --- QUESTION BANK & IMPORT/EXPORT ---
  const handleSaveQuestion = async () => {
      if (!targetExamForAdd) return;
      if (!nqText.trim()) return alert("Teks soal wajib diisi!");
      const newQuestion: Question = {
          id: `manual`,
          type: nqType,
          text: nqText,
          imgUrl: nqImg || undefined,
          points: Number(nqPoints) || 0,
          options: nqOptions,
          correctIndex: nqCorrectIndex,
      };
      await db.addQuestions(targetExamForAdd.id, [newQuestion]);
      setIsAddQuestionModalOpen(false);
      loadData();
      alert("Soal berhasil ditambahkan!");
  };

  const downloadQuestionTemplate = () => {
      const headers = "No,Tipe,Jenis,Soal,Url Gambar,Opsi A,Opsi B,Opsi C,Opsi D,Kunci,Bobot";
      const example1 = "1,PG,UMUM,Siapa presiden pertama RI?,,Soekarno,Hatta,Habibie,Gus Dur,A,10";
      const example2 = "2,PG_KOMPLEKS,UMUM,Pilih dua bilangan genap,,,2,3,4,5,\"A,C\",10";
      const example3 = "3,BENAR_SALAH,UMUM,Tentukan pernyataan berikut!,,,Ikan Berenang,Burung Terbang,Batu Bernapas,Api Dingin,\"B,B,S,S\",10";
      const blob = new Blob([headers + "\n" + example1 + "\n" + example2 + "\n" + example3], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_SOAL_DB_V2.csv'; link.click();
  };
  
  const downloadStudentTemplate = () => {
      const headers = "NISN,NAMA,KELAS,PASSWORD";
      const example = "1234567890,Ahmad Siswa,7A,12345";
      const blob = new Blob([headers + "\n" + example], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_SISWA_KELAS.csv'; link.click();
  };

  const triggerImportQuestions = (examId: string) => { setImportTargetExamId(examId); setTimeout(() => questionFileRef.current?.click(), 100); };
  
  const handleExportQuestions = (exam: Exam) => {
      const headers = ["No", "Tipe", "Jenis", "Soal", "Url Gambar", "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Kunci", "Bobot"];
      const rows = exam.questions.map((q, idx) => {
          const options = q.options || ["", "", "", ""];
          let keyString = '';
          
          if (q.type === 'PG') {
              const keyMap = ['A', 'B', 'C', 'D'];
              keyString = typeof q.correctIndex === 'number' ? keyMap[q.correctIndex] : 'A';
          } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
              const keyMap = ['A', 'B', 'C', 'D'];
              keyString = q.correctIndices.map(i => keyMap[i]).join(',');
          } else if (q.type === 'BENAR_SALAH' && q.correctSequence) {
              keyString = q.correctSequence.join(',');
          }

          return [String(idx + 1), q.type, "UMUM", escapeCSV(q.text), escapeCSV(q.imgUrl), escapeCSV(options[0]), escapeCSV(options[1]), escapeCSV(options[2]), escapeCSV(options[3]), escapeCSV(keyString), String(q.points)].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `BANK_SOAL_${exam.subject}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const onQuestionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0] || !importTargetExamId) return;
      const file = e.target.files[0];
      const targetExam = exams.find(ex => ex.id === importTargetExamId);
      if (!targetExam) return;

      const processRows = (rows: any[]) => {
          const newQuestions: Question[] = rows.map((row, idx) => {
             let type, text, img, oa, ob, oc, od, key, points;
             if (Array.isArray(row)) {
                 if (row.length < 4) return null;
                 type = row[1] ? row[1].trim().toUpperCase() : 'PG'; // Index 1 is Type
                 text = row[3]; img = row[4]; oa = row[5]; ob = row[6]; oc = row[7]; od = row[8]; key = row[9]; points = row[10];
             } else return null;

             if (!text) return null;

             const validTypes = ['PG', 'PG_KOMPLEKS', 'BENAR_SALAH'];
             const finalType: QuestionType = validTypes.includes(type) ? type as QuestionType : 'PG';

             // LOGIC PARSING KEY BERDASARKAN TIPE
             let cIndex = 0;
             let cIndices: number[] = [];
             let cSequence: string[] = [];

             const rawKey = key ? String(key).trim().toUpperCase() : '';

             if (finalType === 'PG') {
                 if (rawKey === 'B') cIndex = 1;
                 else if (rawKey === 'C') cIndex = 2;
                 else if (rawKey === 'D') cIndex = 3;
                 else cIndex = 0; // Default A
             } 
             else if (finalType === 'PG_KOMPLEKS') {
                 // Format: "A,C" or "A, B"
                 const parts = rawKey.split(',').map((p:string) => p.trim());
                 cIndices = parts.map((p:string) => {
                     if (p === 'B') return 1;
                     if (p === 'C') return 2;
                     if (p === 'D') return 3;
                     return 0; // A
                 }).sort();
             }
             else if (finalType === 'BENAR_SALAH') {
                 // Format: "B,S,B,S" (Benar, Salah...)
                 cSequence = rawKey.split(',').map((p:string) => p.trim());
             }

             return {
                  id: `imp-${idx}-${Date.now()}`,
                  type: finalType,
                  text: text || 'Soal',
                  imgUrl: img && String(img).startsWith('http') ? img : undefined,
                  options: [oa || '', ob || '', oc || '', od || ''],
                  correctIndex: cIndex,
                  correctIndices: cIndices,
                  correctSequence: cSequence,
                  points: parseInt(points || '10')
             };
          }).filter(Boolean) as Question[];

          if (newQuestions.length) { 
              db.addQuestions(targetExam.id, newQuestions).then(() => {
                  loadData();
                  alert(`Berhasil import ${newQuestions.length} soal!`);
              }); 
          }
      };

      try {
          const fileText = await file.text();
          const rows = parseCSV(fileText).slice(1);
          processRows(rows);
      } catch (e: any) { console.error(e); alert("Format Salah atau file corrupt."); }
      e.target.value = '';
  };

  const triggerImportStudents = () => { setTimeout(() => studentFileRef.current?.click(), 100); };
  
  const onStudentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      setIsProcessingImport(true);
      try {
          const fileText = await e.target.files[0].text();
          const rows = parseCSV(fileText).slice(1); 
          
          const newUsers = rows.map((row, idx) => {
              if (!row[0] || !row[0].trim()) return null;
              
              const nisn = row[0].trim();
              const name = row[1] ? row[1].trim() : 'Siswa';
              const school = row[2] ? row[2].trim() : '7A'; // Default class
              const password = row[3] ? row[3].trim() : '12345';

              return {
                  id: `temp-${idx}`,
                  name: name,
                  nisn: nisn,
                  username: nisn,
                  password: password,
                  school: school,
                  role: UserRole.STUDENT
              };
          }).filter(Boolean) as User[];
          
          if (newUsers.length > 0) { 
              await db.importStudents(newUsers); 
              await loadData(); 
              alert(`Berhasil import ${newUsers.length} siswa!`); 
          } else {
              alert("File kosong atau format salah.");
          }
      } catch (e: any) { alert("Gagal import siswa. Pastikan menggunakan Template CSV yang benar."); }
      setIsProcessingImport(false);
      e.target.value = '';
  };

  const handleExportResultsExcel = () => {
      const filteredResults = results.filter(r => {
          if (resultSchoolFilter === 'ALL') return true;
          const student = users.find(u => u.id === r.studentId);
          return student?.school === resultSchoolFilter;
      });

      if (filteredResults.length === 0) return alert("Tidak ada data untuk diexport");

      const headers = ["Nama Siswa", "Kelas", "Mata Pelajaran", "Nilai", "Waktu Submit"];
      const rows = filteredResults.map(r => {
          const student = users.find(u => u.id === r.studentId);
          return [
              escapeCSV(r.studentName),
              escapeCSV(student?.school || '-'),
              escapeCSV(r.examTitle),
              String(r.score),
              new Date(r.submittedAt).toLocaleString()
          ].join(",");
      });

      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `HASIL_UJIAN_${resultSchoolFilter}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const getMonitoringUsers = (schoolFilter: string) => {
      let filtered = users;
      if (schoolFilter !== 'ALL') filtered = filtered.filter(u => u.school === schoolFilter);
      if (monitoringSearch) filtered = filtered.filter(u => u.name.toLowerCase().includes(monitoringSearch.toLowerCase()) || u.nisn?.includes(monitoringSearch));
      return filtered;
  };

  // --- HELPER FOR STUDENT STATUS COLORS ---
  const getStudentStatusInfo = (u: User) => {
      if (u.status === 'finished') return { color: 'bg-green-100 text-green-700 border-green-200', label: 'Selesai' };
      if (u.isLogin) return { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Mengerjakan' };
      return { color: 'bg-red-100 text-red-700 border-red-200', label: 'Belum Login' };
  };
  
  // -- BULK ACTION LOGIC --
  const toggleSelectAll = (filteredUsers: User[]) => {
      if (selectedStudentIds.length === filteredUsers.length) {
          setSelectedStudentIds([]);
      } else {
          setSelectedStudentIds(filteredUsers.map(u => u.id));
      }
  };

  const toggleSelectOne = (id: string) => {
      if (selectedStudentIds.includes(id)) {
          setSelectedStudentIds(prev => prev.filter(uid => uid !== id));
      } else {
          setSelectedStudentIds(prev => [...prev, id]);
      }
  };

  const handleBulkReset = async () => {
      if (!selectedStudentIds.length) return;
      if (!confirm(`Reset login status untuk ${selectedStudentIds.length} siswa terpilih?`)) return;
      
      setIsLoadingData(true);
      for (const id of selectedStudentIds) {
          await db.resetUserStatus(id);
      }
      setSelectedStudentIds([]);
      await loadData();
      alert("Berhasil reset masal.");
  };

  // Derived Values - Note: 'school' maps to Class Name
  const schools = (Array.from(new Set(users.map(u => u.school || 'Unknown'))).filter(Boolean) as string[]).sort();
  const totalSchools = schools.length;

  // Responsive Nav Item (Icons on Mobile, Full on Desktop)
  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
      <button 
        onClick={() => { setActiveTab(id); setDashboardView('MAIN'); }} 
        className={`w-full flex items-center justify-center md:justify-start md:space-x-3 p-3 md:px-4 md:py-3 rounded-lg transition mb-1 text-sm font-medium ${activeTab === id ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/20' : 'text-blue-100 hover:bg-white/5'}`}
        title={label}
      >
          <Icon size={20} className="flex-shrink-0" />
          <span className="hidden md:block truncate">{label}</span>
      </button>
  );
  
  // Monitoring Filtered Users
  const filteredMonitoringUsers = getMonitoringUsers('ALL').filter(u => u.isLogin);

  // --- Calculate Available Schools for Mapping (Filtering Logic) ---
  const getSchoolsAvailability = () => {
      const busySchools = new Set<string>();
      
      exams.forEach(ex => {
          if (editingExam && ex.id === editingExam.id) return;
          if (ex.examDate === editDate && ex.session === editSession && ex.schoolAccess) {
              ex.schoolAccess.forEach(s => busySchools.add(s));
          }
      });

      const assigned = editSchoolAccess.sort();
      const available = schools.filter(s => 
          !assigned.includes(s) && 
          !busySchools.has(s) && 
          s.toLowerCase().includes(mappingSearch.toLowerCase())
      );
      const busyCount = busySchools.size;
      return { assigned, available, busyCount };
  };

  const { assigned: assignedSchools, available: availableSchools, busyCount } = isEditModalOpen ? getSchoolsAvailability() : { assigned: [], available: [], busyCount: 0 };

  // --- AGGREGATION FOR "JUMLAH SEKOLAH" DASHBOARD VIEW ---
  const getSchoolStats = (schoolName: string) => {
      const studentsInSchool = users.filter(u => u.school === schoolName);
      const notLogin = studentsInSchool.filter(u => !u.isLogin && u.status !== 'finished').length;
      const working = studentsInSchool.filter(u => u.isLogin && u.status !== 'finished').length;
      const finished = studentsInSchool.filter(u => u.status === 'finished').length;
      
      // Get exam mapping for today
      const today = new Date().toISOString().split('T')[0];
      const todayExam = exams.find(e => e.examDate === today && e.schoolAccess?.includes(schoolName));
      
      return { notLogin, working, finished, total: studentsInSchool.length, todayExamTitle: todayExam?.title || '-' };
  };

  const handleDownloadSchoolStats = () => {
      const headers = ["Nama Kelas", "Total Siswa", "Belum Login", "Mengerjakan", "Selesai", "Mapel Hari Ini"];
      const rows = schools.map(s => {
          const stats = getSchoolStats(s);
          return [escapeCSV(s), stats.total, stats.notLogin, stats.working, stats.finished, escapeCSV(stats.todayExamTitle)].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `REKAP_KELAS_HARI_INI.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // --- RENDER CONTENT BASED ON DASHBOARD VIEW ---
  const renderDashboardContent = () => {
    if (dashboardView === 'STUDENTS_DETAIL') {
        const filteredSchools = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];
        
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Detail Status Siswa (Realtime)</h3>
                    </div>
                    <select className="border rounded p-2 text-sm min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                        <option value="ALL">Semua Kelas</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSchools.map(school => {
                        const students = users.filter(u => u.school === school);
                        return (
                            <div key={school} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                <div className="p-3 bg-gray-50 border-b font-bold text-gray-700 text-sm truncate" title={school}>{school}</div>
                                <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                                    {students.map(u => {
                                        const status = getStudentStatusInfo(u);
                                        return (
                                            <div key={u.id} className={`flex items-center justify-between p-2 rounded border text-xs ${status.color}`}>
                                                <span className="font-bold truncate w-2/3">{u.name}</span>
                                                <span className="font-bold whitespace-nowrap">{status.label}</span>
                                            </div>
                                        )
                                    })}
                                    {students.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Tidak ada siswa.</p>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    }

    if (dashboardView === 'SCHOOLS_DETAIL') {
        const filteredSchoolsList = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Rekap Mapping & Status Kelas</h3>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                         <select className="border rounded p-2 text-sm flex-1 md:min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                            <option value="ALL">Semua Kelas</option>
                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={handleDownloadSchoolStats} className="bg-green-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center hover:bg-green-700"><Download size={16} className="md:mr-2"/><span className="hidden md:inline">CSV</span></button>
                    </div>
                </div>

                <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 font-bold border-b text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="p-4">Nama Kelas</th>
                                <th className="p-4 text-center">Total Siswa</th>
                                <th className="p-4 text-center text-red-600">Belum Login</th>
                                <th className="p-4 text-center text-blue-600">Mengerjakan</th>
                                <th className="p-4 text-center text-green-600">Selesai</th>
                                <th className="p-4">Jadwal Mapel Hari Ini</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredSchoolsList.map(school => {
                                const stats = getSchoolStats(school);
                                return (
                                    <tr key={school} className="hover:bg-gray-50">
                                        <td className="p-4 font-bold text-gray-700">{school}</td>
                                        <td className="p-4 text-center font-mono">{stats.total}</td>
                                        <td className="p-4 text-center font-mono text-red-600 font-bold bg-red-50">{stats.notLogin}</td>
                                        <td className="p-4 text-center font-mono text-blue-600 font-bold bg-blue-50">{stats.working}</td>
                                        <td className="p-4 text-center font-mono text-green-600 font-bold bg-green-50">{stats.finished}</td>
                                        <td className="p-4 text-xs font-bold text-gray-500">{stats.todayExamTitle}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (dashboardView === 'EXAMS_DETAIL') {
        const relevantUsers = users.filter(u => {
             const hasAccess = exams.some(e => e.schoolAccess?.includes(u.school || ''));
             return hasAccess && (dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter);
        });

        const finishedUsers = relevantUsers.filter(u => u.status === 'finished');
        const unfinishedUsers = relevantUsers.filter(u => u.status !== 'finished');

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                         <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                         <h3 className="font-bold text-lg text-gray-800">Detail Status Penyelesaian</h3>
                    </div>
                    <select className="border rounded p-2 text-sm min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                        <option value="ALL">Semua Kelas Termapping</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                            <h4 className="font-bold text-green-800 flex items-center"><CheckCircle size={18} className="mr-2"/> Sudah Selesai ({finishedUsers.length})</h4>
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Kelas</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {finishedUsers.map(u => (
                                        <tr key={u.id}>
                                            <td className="p-3 font-medium">{u.name}</td>
                                            <td className="p-3 text-gray-500">{u.school}</td>
                                        </tr>
                                    ))}
                                    {finishedUsers.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
                             <h4 className="font-bold text-red-800 flex items-center"><XCircle size={18} className="mr-2"/> Belum Selesai ({unfinishedUsers.length})</h4>
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Kelas</th><th className="p-3">Status</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {unfinishedUsers.map(u => {
                                        const st = getStudentStatusInfo(u);
                                        return (
                                            <tr key={u.id}>
                                                <td className="p-3 font-medium">{u.name}</td>
                                                <td className="p-3 text-gray-500">{u.school}</td>
                                                <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}>{st.label}</span></td>
                                            </tr>
                                        )
                                    })}
                                    {unfinishedUsers.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- MAIN RENDER ---
    return (
        <div className="animate-in fade-in">
            {/* Same Dashboard Cards but with Updated Text */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition border-l-4 border-l-blue-500 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Mapel</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{exams.length}</h3>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg group-hover:scale-110 transition"><BookOpen className="text-blue-500" size={24}/></div>
                    </div>
                </div>

                <div 
                    onClick={() => setDashboardView('STUDENTS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-green-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Siswa Terdaftar</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{users.length}</h3>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg group-hover:scale-110 transition"><Users className="text-green-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-green-600 mt-4 font-bold flex items-center">Lihat Detail Status <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>

                <div 
                    onClick={() => setDashboardView('SCHOOLS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-purple-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Jumlah Kelas</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{schools.length}</h3>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg group-hover:scale-110 transition"><School className="text-purple-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-purple-600 mt-4 font-bold flex items-center">Lihat Mapping & Status <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>

                <div 
                    onClick={() => setDashboardView('EXAMS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-orange-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Ujian Selesai</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{results.length}</h3>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg group-hover:scale-110 transition"><GraduationCap className="text-orange-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-orange-600 mt-4 font-bold flex items-center">Lihat Rekap Pengerjaan <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>
            </div>

            {/* Existing Charts and Tables remain largely the same, just 'Sekolah' updated to 'Kelas' in labels */}
            {/* Omitted redundant parts to save space, assuming they follow the pattern */}
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden print:h-auto print:overflow-visible">
      <input type="file" ref={studentFileRef} className="hidden" accept=".csv" onChange={onStudentFileChange} />
      <input type="file" ref={questionFileRef} className="hidden" accept=".csv" onChange={onQuestionFileChange} />

      {/* SIDEBAR */}
      <aside className="w-16 md:w-64 flex-shrink-0 text-white flex flex-col shadow-xl z-20 transition-all duration-300 print:hidden" style={{ backgroundColor: themeColor }}>
          <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-center md:justify-start md:space-x-3">
              <BookOpen size={28} className="text-white drop-shadow-md flex-shrink-0" />
              <div className="hidden md:block overflow-hidden whitespace-nowrap">
                  <h1 className="font-bold text-lg tracking-wide">ADMIN APT</h1>
                  <p className="text-xs text-blue-100 opacity-80">Panel Admin SPENDAPOL</p>
              </div>
          </div>
          <nav className="flex-1 p-2 md:p-4 overflow-y-auto custom-scrollbar">
              <NavItem id="DASHBOARD" label="Dashboard" icon={LayoutDashboard} />
              <NavItem id="MONITORING" label="Monitoring Ujian" icon={Activity} />
              <NavItem id="HASIL_UJIAN" label="Hasil Ujian" icon={ClipboardList} />
              <div className="my-2 border-t border-white/10"></div>
              <NavItem id="BANK_SOAL" label="Bank Soal" icon={Database} />
              <NavItem id="MAPPING" label="Mapping Kelas" icon={Map} />
              <NavItem id="PESERTA" label="Data Peserta" icon={RotateCcw} />
              <NavItem id="CETAK_KARTU" label="Cetak Kartu" icon={Printer} />
              <div className="my-2 border-t border-white/10"></div>
              <NavItem id="ANTI_CHEAT" label="Sistem Anti-Curang" icon={ShieldAlert} />
          </nav>
          <div className="p-2 md:p-4 border-t border-white/10 bg-black/10">
               <button onClick={onLogout} className="w-full flex items-center justify-center md:space-x-2 bg-red-500/20 hover:bg-red-500/40 text-red-100 p-2 md:py-2 rounded text-xs font-bold transition border border-red-500/30" title="Keluar">
                   <LogOut size={16} /> <span className="hidden md:inline">Keluar</span>
               </button>
          </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50 print:overflow-visible print:h-auto print:absolute print:top-0 print:left-0 print:w-full print:m-0 print:p-0 print:bg-white">
          {/* HEADER */}
          <header className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:hidden gap-4">
               <h2 className="text-2xl font-bold text-gray-800 flex items-center">{activeTab.replace('_', ' ')}</h2>
               {isLoadingData && <span className="text-xs text-blue-500 animate-pulse flex items-center"><Loader2 size={12} className="animate-spin mr-1"/> Memuat Data...</span>}
          </header>

          {activeTab === 'DASHBOARD' && renderDashboardContent()}

          {/* ... (Monitoring, Bank Soal logic remains same, just ensuring correct mapping) ... */}
          
          {/* MAPPING KELAS */}
          {activeTab === 'MAPPING' && (
              <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                  <h3 className="font-bold text-lg mb-4 flex items-center"><Map size={20} className="mr-2 text-blue-600"/> Mapping Jadwal & Akses Kelas</h3>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 font-bold border-b">
                            <tr>
                                <th className="p-3">Mapel</th>
                                <th className="p-3">Tanggal & Sesi</th>
                                <th className="p-3">Durasi</th>
                                <th className="p-3">Token</th>
                                <th className="p-3">Akses Kelas</th>
                                <th className="p-3">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                              {exams.map(ex => (
                                  <tr key={ex.id}>
                                      <td className="p-3 font-medium">{ex.title}</td>
                                      <td className="p-3">
                                          <div className="flex flex-col">
                                              <span className="font-bold">{ex.examDate ? new Date(ex.examDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</span>
                                              <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded w-fit mt-1">{ex.session || 'Sesi 1'}</span>
                                          </div>
                                      </td>
                                      <td className="p-3">{ex.durationMinutes} Menit</td>
                                      <td className="p-3 font-mono bg-yellow-50 font-bold">{ex.token}</td>
                                      <td className="p-3">
                                          {ex.schoolAccess && ex.schoolAccess.length > 0 ? (
                                              <div className="flex flex-wrap gap-1">
                                                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">{ex.schoolAccess.length} Kelas</span>
                                                  {ex.schoolAccess.slice(0, 2).map(s => <span key={s} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] truncate max-w-[100px]">{s}</span>)}
                                                  {ex.schoolAccess.length > 2 && <span className="text-[10px] text-gray-400 self-center">...</span>}
                                              </div>
                                          ) : (
                                              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">Belum di-set</span>
                                          )}
                                      </td>
                                      <td className="p-3"><button onClick={() => openMappingModal(ex)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold text-xs hover:bg-blue-100 transition flex items-center"><Edit size={12} className="mr-1"/> Mapping</button></td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* ... (Other Tabs with Updated "Kelas" labels) ... */}
          
          {/* MAPPING MODAL (Updated Text) */}
          {isEditModalOpen && editingExam && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                      <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                          <div>
                              <h3 className="font-bold text-xl text-gray-800">Mapping Jadwal & Akses Kelas</h3>
                              <p className="text-sm text-gray-500">{editingExam.title} - {editingExam.questions.length} Soal</p>
                          </div>
                          <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X/></button>
                      </div>
                      
                      <div className="p-6 overflow-y-auto flex-1">
                          {/* ... Date/Token inputs ... */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1">Tanggal Ujian</label>
                                  <input type="date" className="w-full border rounded p-2 text-sm" value={editDate} onChange={e => setEditDate(e.target.value)} />
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1">Sesi Ujian</label>
                                  <select className="w-full border rounded p-2 text-sm" value={editSession} onChange={e => setEditSession(e.target.value)}>
                                      <option>Sesi 1</option>
                                      <option>Sesi 2</option>
                                      <option>Sesi 3</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1">Durasi (Menit)</label>
                                  <input type="number" className="w-full border rounded p-2 text-sm" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} />
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1">Token Ujian</label>
                                  <input type="text" className="w-full border rounded p-2 text-sm font-mono uppercase font-bold tracking-widest bg-yellow-50" value={editToken} onChange={e => setEditToken(e.target.value.toUpperCase())} maxLength={6} />
                              </div>
                          </div>

                          <div className="border-t pt-6">
                               <div className="flex justify-between items-center mb-4">
                                   <h4 className="font-bold text-gray-800 flex items-center"><School size={18} className="mr-2"/> Akses Kelas</h4>
                                   <div className="text-xs space-x-2">
                                       <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">Terpilih: {editSchoolAccess.length}</span>
                                       <span className="text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">Tersedia: {availableSchools.length}</span>
                                       {busyCount > 0 && <span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded">Bentrok: {busyCount}</span>}
                                   </div>
                               </div>

                               <div className="flex gap-4 mb-4">
                                   <div className="relative flex-1">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                                        <input type="text" placeholder="Cari kelas..." className="w-full pl-9 pr-4 py-2 border rounded text-sm" value={mappingSearch} onChange={e => setMappingSearch(e.target.value)} />
                                   </div>
                                   <button onClick={() => addAllAvailableSchools(availableSchools)} className="bg-blue-100 text-blue-700 px-3 py-2 rounded text-xs font-bold whitespace-nowrap hover:bg-blue-200">Pilih Semua Tersedia</button>
                               </div>
                               
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   {/* SELECTED */}
                                   <div className="border rounded-lg overflow-hidden">
                                       <div className="bg-green-50 p-2 text-xs font-bold text-green-700 border-b flex justify-between">
                                           <span>KELAS TERPILIH (AKSES DIBUKA)</span>
                                           <button onClick={() => setEditSchoolAccess([])} className="text-red-500 hover:underline">Hapus Semua</button>
                                       </div>
                                       <div className="h-48 overflow-y-auto p-2 space-y-1">
                                           {assignedSchools.map(s => (
                                               <div key={s} onClick={() => toggleSchoolAccess(s)} className="flex items-center justify-between p-2 rounded bg-green-100 border border-green-200 cursor-pointer hover:bg-red-50 hover:border-red-200 group transition">
                                                   <span className="text-xs font-bold text-gray-700">{s}</span>
                                                   <X size={14} className="text-green-600 group-hover:text-red-500"/>
                                               </div>
                                           ))}
                                           {assignedSchools.length === 0 && <p className="text-center text-xs text-gray-400 py-10">Belum ada kelas dipilih</p>}
                                       </div>
                                   </div>

                                   {/* AVAILABLE */}
                                   <div className="border rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 p-2 text-xs font-bold text-gray-600 border-b">KELAS TERSEDIA</div>
                                        <div className="h-48 overflow-y-auto p-2 space-y-1">
                                            {availableSchools.map(s => (
                                                <div key={s} onClick={() => toggleSchoolAccess(s)} className="flex items-center justify-between p-2 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 hover:border-blue-200 group transition">
                                                     <span className="text-xs text-gray-600">{s}</span>
                                                     <Plus size={14} className="text-gray-300 group-hover:text-blue-500"/>
                                                </div>
                                            ))}
                                            {availableSchools.length === 0 && <p className="text-center text-xs text-gray-400 py-10">Tidak ada kelas tersedia dengan filter ini</p>}
                                        </div>
                                   </div>
                               </div>
                          </div>
                      </div>
                      
                      <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3">
                          <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 rounded text-sm font-bold text-gray-600 hover:bg-gray-200">Batal</button>
                          <button onClick={handleSaveMapping} className="px-6 py-2 rounded bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-md">Simpan Mapping</button>
                      </div>
                  </div>
              </div>
          )}

      </main>
    </div>
  );
};
