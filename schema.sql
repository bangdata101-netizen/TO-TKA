-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table: students (Used for all users: SUPER_ADMIN, ADMIN, STUDENT)
CREATE TABLE students (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    nisn TEXT UNIQUE NOT NULL, -- Used as username
    password TEXT DEFAULT '12345',
    role TEXT DEFAULT 'STUDENT', -- 'SUPER_ADMIN', 'ADMIN', 'STUDENT'
    school TEXT DEFAULT 'UMUM',
    is_login BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'idle', -- 'idle', 'working', 'finished', 'blocked'
    grade INTEGER DEFAULT 6,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Table: subjects (Exams)
CREATE TABLE subjects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    duration INTEGER DEFAULT 60,
    question_count INTEGER DEFAULT 0,
    token TEXT,
    exam_date TEXT, -- Stored as YYYY-MM-DD string to match frontend logic
    session TEXT DEFAULT 'Sesi 1',
    school_access JSONB DEFAULT '[]'::jsonb, -- Array of strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Table: questions
-- Quoted identifiers used to match existing frontend mapping in database.ts
CREATE TABLE questions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    "Nomor" TEXT,
    "Tipe Soal" TEXT DEFAULT 'PG',
    "Jenis Soal" TEXT DEFAULT 'UMUM',
    "Soal" TEXT,
    "Url Gambar" TEXT,
    "Opsi A" TEXT,
    "Opsi B" TEXT,
    "Opsi C" TEXT,
    "Opsi D" TEXT,
    "Kunci" TEXT, -- A, B, C, D
    "Bobot" TEXT DEFAULT '10',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Table: results
CREATE TABLE results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    score NUMERIC DEFAULT 0,
    cheating_attempts INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. RLS Policies (For Development: Open Access)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access Students" ON students FOR ALL USING (true);
CREATE POLICY "Public Access Subjects" ON subjects FOR ALL USING (true);
CREATE POLICY "Public Access Questions" ON questions FOR ALL USING (true);
CREATE POLICY "Public Access Results" ON results FOR ALL USING (true);

-- 7. Seed Data
INSERT INTO students (name, nisn, password, role, school) 
VALUES 
('Super Administrator', 'superadmin', 'admin', 'SUPER_ADMIN', 'PUSAT'),
('Admin Sekolah', 'admin', 'admin', 'ADMIN', 'PUSAT');
