import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function POST(req: Request) {
  try {
    const { id, studentId: legacyStudentId, name } = await req.json();
    const studentId = (id ?? legacyStudentId)?.toString();
    
    // Validate input
    if (!studentId || !name) {
      return NextResponse.json(
        { success: false, message: 'ID and name are required' },
        { status: 400 }
      );
    }
    
    // Validate student ID format (exactly 2 digits)
    const idPattern = /^\d{2}$/;
    if (!idPattern.test(studentId.trim())) {
      return NextResponse.json(
        { success: false, message: 'ID must be exactly 2 digits' },
        { status: 400 }
      );
    }
    
    // Validate name format (two words, alphabets only)
    const namePattern = /^[A-Za-z]+ [A-Za-z]+$/;
    if (!namePattern.test(name.trim())) {
      return NextResponse.json(
        { success: false, message: 'Enter first and last name (alphabets only)' },
        { status: 400 }
      );
    }
    
    const db = DatabaseService.getInstance();

    // Call external authentication API
    const authApiUrl = process.env.AUTH_API_URL ?? process.env.NEXT_PUBLIC_AUTH_API_URL;
    if (!authApiUrl) {
      return NextResponse.json(
        { success: false, message: 'Server not configured: AUTH_API_URL missing' },
        { status: 500 }
      );
    }

    const apiToken = process.env.API_TOKEN ?? process.env.X_API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN;
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiToken) baseHeaders['Authorization'] = `Bearer ${apiToken}`;

    // Try POST first; if not supported, fall back to GET list and match locally
    let authData: any = undefined;
    let postOk = false;
    try {
      const authRes = await fetch(authApiUrl, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({ id: studentId, name })
      });
      console.log('External API POST response status:', authRes.status);
      if (authRes.ok) {
        authData = await authRes.json();
      }
    } catch {}

    if (!postOk) {
      // Fallback: GET students list and match by id and name
      const listRes = await fetch(authApiUrl, {
        method: 'GET',
        headers: apiToken ? { 'Authorization': `Bearer ${apiToken}` } : undefined,
        cache: 'no-store',
      });
      if (!listRes.ok) {
        return NextResponse.json(
          { success: false, message: 'Authentication failed' },
          { status: 401 }
        );
      }
      const students: any[] = await listRes.json();
      const [firstName, lastName] = name.split(' ');
      const byId = students.filter(s => String(s.id) === String(studentId));
      const match = (byId.length > 0 ? byId : students).find(s =>
        String((s.firstname || '')).toLowerCase() === String(firstName || '').toLowerCase() &&
        String((s.lastname || '')).toLowerCase() === String(lastName || '').toLowerCase()
      ) || byId[0] || students[0];
      authData = { profile: match };
      // include enrollment rows for this student id
      const enrollmentRows = students.filter(s => String(s.id) === String(studentId));
      authData.enrollment = enrollmentRows.map(r => ({
        class: r.class,
        class_id: r.class_id,
        section: r.section,
        section_id: r.section_id,
        admission_no: r.admission_no,
        roll_no: r.roll_no,
        created_at: r.created_at,
      }));
    }

    // Derive API base to fetch related resources
    let apiBase: string | null = null;
    try {
      const u = new URL(authApiUrl);
      apiBase = `${u.origin}/api`;
    } catch {}

    // Helper to safely fetch JSON
    const fetchJson = async (url: string) => {
      try {
        const r = await fetch(url, { cache: 'no-store', headers: apiToken ? { 'Authorization': `Bearer ${apiToken}` } : undefined });
        if (!r.ok) return undefined;
        return await r.json();
      } catch {
        return undefined;
      }
    };

    let profile: unknown = undefined;
    let attendance: unknown = undefined;
    let enrollment: unknown = undefined;
    let assignments: unknown = undefined;
    let examlist: unknown = undefined;
    let scores: unknown = undefined;

    if (apiBase) {
      // Try to gather data in parallel. Endpoints from: https://alnada.eprime.app/api/students etc.
      const studentsUrl = `${apiBase}/students`;
      const attendanceUrl = `${apiBase}/student/attendance/summary/monthly/${encodeURIComponent(studentId)}/`;
      const assignmentsUrl = `${apiBase}/student/assignments/${encodeURIComponent(studentId)}/`;
      const examListUrl = `${apiBase}/student/ExamList/${encodeURIComponent(studentId)}/`;
      const enrollmentUrl = `${apiBase}/students/enrollment/`;

      const [students, attn, asg, exList, enroll] = await Promise.all([
        fetchJson(studentsUrl),
        fetchJson(attendanceUrl),
        fetchJson(assignmentsUrl),
        fetchJson(examListUrl),
        fetchJson(enrollmentUrl),
      ]);

      // Basic shaping/filtering best-effort
      if (Array.isArray(students)) {
        profile = students.find((s: any) => String(s.id ?? s.studentId) === String(studentId)) ?? students;
      } else {
        profile = students;
      }
      attendance = attn;
      assignments = asg;
      examlist = exList;
      if (Array.isArray(enroll)) {
        enrollment = enroll.find((e: any) => String(e.student_id ?? e.studentId) === String(studentId)) ?? enroll;
      } else {
        enrollment = enroll;
      }

      // Optionally fetch exam data using first exam id if available
      try {
        const firstExamId = Array.isArray(exList) && exList.length > 0 ? (exList[0].id ?? exList[0].exam_id ?? exList[0].ExamID) : undefined;
        if (firstExamId) {
          const examDataUrl = `${apiBase}/student/ExamData/${encodeURIComponent(studentId)}/${encodeURIComponent(firstExamId)}/`;
          scores = await fetchJson(examDataUrl);
        }
      } catch {}
    }

    // Upsert student profile into MongoDB (normalize fields)
    await db.upsertStudent({
      studentId,
      name,
      lastLogin: new Date(),
      profile: authData.profile ?? profile,
      attendance: authData.attendance ?? attendance,
      enrollment: authData.enrollment ?? enrollment,
      scores: authData.scores ?? authData.score ?? scores,
      assignments: authData.assignments ?? assignments,
      examlist: authData.examlist ?? examlist,
    });

    // Create a new chat session
    const sessionId = await db.createChatSession(studentId);
    
    return NextResponse.json({
      success: true,
      student: {
        studentId,
        name,
        lastLogin: new Date().toISOString()
      },
      sessionId
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = (searchParams.get('id') ?? searchParams.get('studentId')) ?? undefined as unknown as string;
    
    if (!studentId) {
      return NextResponse.json(
        { success: false, message: 'ID is required' },
        { status: 400 }
      );
    }
    
    const db = DatabaseService.getInstance();
    const student = await db.getStudentById(studentId);
    
    if (!student) {
      return NextResponse.json(
        { success: false, message: 'Student not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      student: {
        studentId: student.studentId,
        name: student.name,
        lastLogin: student.lastLogin,
        profile: student.profile
      }
    });
    
  } catch (error) {
    console.error('Error fetching student:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
