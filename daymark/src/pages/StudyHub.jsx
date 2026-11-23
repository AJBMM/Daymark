import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, BookOpen, CalendarDays, Check, Clock3, Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react'
import './studyhub.css'

const today = () => new Date().toLocaleDateString('en-CA')
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'
const minsLabel = value => `${Math.floor((Number(value) || 0) / 60)}h${(Number(value) || 0) % 60 ? ` ${(Number(value) || 0) % 60}m` : ''}`
const emptyForm = { subject_id: '', title: '', exam_date: '', target_hours: 20, notes: '' }

export default function StudyHub({ supabase, userId, notify = () => {} }) {
  const [tab, setTab] = useState('revision')
  const [subjects, setSubjects] = useState([])
  const [exams, setExams] = useState([])
  const [sessions, setSessions] = useState([])
  const [papers, setPapers] = useState([])
  const [errors, setErrors] = useState([])
  const [homework, setHomework] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [examForm, setExamForm] = useState(emptyForm)
  const [paperForm, setPaperForm] = useState({ subject_id: '', title: '', completed_date: today(), score: '', max_marks: 100, duration_minutes: 90, exam_board: '', notes: '' })
  const [errorForm, setErrorForm] = useState({ subject_id: '', past_paper_id: '', question: '', topic: '', error_type: 'Knowledge gap', correction: '' })
  const [homeworkForm, setHomeworkForm] = useState({ subject_id: '', title: '', deadline: '', estimated_minutes: 60, notes: '' })

  async function refresh() {
    setLoading(true)
    const tables = ['subjects', 'exams', 'revision_sessions', 'past_papers', 'errors', 'homework']
    const results = await Promise.all(tables.map(table => supabase.from(table).select('*').order(table === 'subjects' ? 'name' : 'created_at', { ascending: true })))
    const setters = [setSubjects, setExams, setSessions, setPapers, setErrors, setHomework]
    let failed = false
    results.forEach((result, index) => { if (result.error) { failed = true } else setters[index](result.data || []) })
    if (failed) notify('Some study data could not load. Check that the Daymark database update has been run in Supabase.')
    setLoading(false)
  }
  useEffect(() => { refresh() }, [userId])

  async function insert(table, values, after) {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.from(table).insert({ ...values, user_id: userId }).select().single()
    setBusy(false)
    if (error) return notify(error.message)
    after?.(data)
    notify('Saved')
  }
  async function update(table, id, values, setter, current) {
    const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single()
    if (error) return notify(error.message)
    setter(current.map(item => item.id === id ? data : item))
  }
  async function remove(table, id, setter, current) {
    if (!window.confirm('Delete this item?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return notify(error.message)
    setter(current.filter(item => item.id !== id)); notify('Deleted')
  }

  async function addSubject(e) {
    e.preventDefault(); if (!subjectName.trim()) return
    await insert('subjects', { name: subjectName.trim(), color: '#71866a' }, row => { setSubjects(old => [...old, row].sort((a,b) => a.name.localeCompare(b.name))); setSubjectName('') })
  }
  async function addExam(e) {
    e.preventDefault(); if (!examForm.title.trim() || !examForm.subject_id || !examForm.exam_date) return
    await insert('exams', { ...examForm, title: examForm.title.trim(), target_hours: Number(examForm.target_hours) }, row => { setExams(old => [...old, row]); setExamForm(emptyForm) })
  }
  async function planRevision(exam) {
    const start = new Date(`${today()}T12:00:00`)
    const end = new Date(`${exam.exam_date}T12:00:00`)
    const days = Math.max(1, Math.ceil((end - start) / 86400000))
    const totalMinutes = Math.round(Number(exam.target_hours) * 60)
    const perDay = Math.ceil(totalMinutes / days / 15) * 15
    if (!totalMinutes || !Number.isFinite(totalMinutes)) return notify('Set a revision target greater than zero first.')
    if (end < start) return notify('That exam date has already passed.')
    // Re-running a plan replaces only its unfinished sessions; completed work is preserved.
    const { error: clearError } = await supabase.from('revision_sessions').delete().eq('exam_id', exam.id).eq('status', 'planned')
    if (clearError) return notify(clearError.message)
    const rows = Array.from({ length: days }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i)
      return { user_id: userId, subject_id: exam.subject_id, exam_id: exam.id, planned_date: d.toLocaleDateString('en-CA'), planned_minutes: Math.min(perDay, totalMinutes - i * perDay), completed_minutes: 0, status: 'planned' }
    }).filter(row => row.planned_minutes > 0)
    setBusy(true)
    const { error } = await supabase.from('revision_sessions').insert(rows)
    setBusy(false)
    if (error) return notify(error.message)
    await refresh(); notify(`Created ${rows.length} daily revision targets`)
  }
  async function addPaper(e) {
    e.preventDefault(); if (!paperForm.subject_id || !paperForm.title.trim() || paperForm.score === '') return
    const score = Number(paperForm.score), max = Number(paperForm.max_marks), duration = Number(paperForm.duration_minutes)
    if (max <= 0 || score < 0 || score > max || duration <= 0) return notify('Check the marks and time entered.')
    await insert('past_papers', { ...paperForm, title: paperForm.title.trim(), score, max_marks: max, duration_minutes: duration, exam_board: paperForm.exam_board || null }, row => { setPapers(old => [...old, row].sort((a,b) => a.completed_date.localeCompare(b.completed_date))); setPaperForm({ subject_id: '', title: '', completed_date: today(), score: '', max_marks: 100, duration_minutes: 90, exam_board: '', notes: '' }) })
  }
  async function addError(e) {
    e.preventDefault(); if (!errorForm.subject_id || !errorForm.question.trim()) return
    await insert('errors', { ...errorForm, question: errorForm.question.trim(), topic: errorForm.topic.trim(), correction: errorForm.correction.trim(), past_paper_id: errorForm.past_paper_id || null }, row => { setErrors(old => [row, ...old]); setErrorForm({ subject_id: '', past_paper_id: '', question: '', topic: '', error_type: 'Knowledge gap', correction: '' }) })
  }
  async function addHomework(e) {
    e.preventDefault(); if (!homeworkForm.subject_id || !homeworkForm.title.trim()) return
    await insert('homework', { ...homeworkForm, title: homeworkForm.title.trim(), estimated_minutes: Number(homeworkForm.estimated_minutes), status: 'todo' }, row => { setHomework(old => [...old, row]); setHomeworkForm({ subject_id: '', title: '', deadline: '', estimated_minutes: 60, notes: '' }) })
  }

  const subjectNameFor = id => subjects.find(s => s.id === id)?.name || 'Unassigned'
  const sortedPapers = [...papers].sort((a,b) => a.completed_date.localeCompare(b.completed_date))
  const upcomingSessions = [...sessions].sort((a,b) => a.planned_date.localeCompare(b.planned_date))
  const outstandingHomework = homework.filter(h => h.status !== 'done')
  const scoreAverage = papers.length ? Math.round(papers.reduce((sum,p) => sum + p.score / p.max_marks * 100, 0) / papers.length) : 0
  const nav = [
    ['revision', 'Revision planner', CalendarDays], ['subjects', 'Subjects', BookOpen], ['papers', 'Past papers & tests', Check],
    ['errors', 'Error log', AlertCircle], ['analytics', 'Analytics', TrendingUp], ['homework', 'Homework', Clock3]
  ]
  const subjectOptions = <option value="">Choose a subject</option>
  if (loading) return <div className="study-content"><div className="study-empty">Loading your study workspace…</div></div>

  return <section className="study-content">
    <div className="study-heading"><div><div className="eyebrow">YOUR STUDY WORKSPACE</div><h1>Study centre</h1><p className="muted">Plan revision, measure progress and keep homework separate.</p></div><div className="study-summary"><b>{scoreAverage}%</b><span>average paper score</span></div></div>
    <div className="study-tabs">{nav.map(([id,label,Icon]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}><Icon size={15}/>{label}</button>)}</div>

    {tab === 'subjects' && <div className="study-panel"><div className="study-panel-head"><div><h2>Your subjects</h2><p>Add the subjects you study. Other study records will link to these.</p></div></div><form className="study-inline-form" onSubmit={addSubject}><input value={subjectName} onChange={e=>setSubjectName(e.target.value)} placeholder="e.g. Further Maths" required/><button className="primary" disabled={busy}><Plus size={15}/> Add subject</button></form>{subjects.length ? <div className="study-list">{subjects.map(s=><div className="study-list-row" key={s.id}><span className="subject-dot"/><b>{s.name}</b><span className="study-spacer"/><button className="study-delete" onClick={()=>remove('subjects',s.id,setSubjects,subjects)} title="Delete subject"><Trash2 size={15}/></button></div>)}</div> : <Empty text="No subjects yet. Add your first subject above."/>}</div>}

    {tab === 'revision' && <><div className="study-panel"><div className="study-panel-head"><div><h2>Exam dates & revision targets</h2><p>Set an exam date and the total revision time you want to complete before it.</p></div></div><form className="study-form" onSubmit={addExam}><label>Subject<select value={examForm.subject_id} onChange={e=>setExamForm({...examForm,subject_id:e.target.value})} required>{subjectOptions}{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Exam name<input value={examForm.title} onChange={e=>setExamForm({...examForm,title:e.target.value})} placeholder="e.g. Paper 1 – Pure Mathematics" required/></label><div className="study-form-row"><label>Exam date<input type="date" min={today()} value={examForm.exam_date} onChange={e=>setExamForm({...examForm,exam_date:e.target.value})} required/></label><label>Total revision target (hours)<input type="number" min="1" max="1000" value={examForm.target_hours} onChange={e=>setExamForm({...examForm,target_hours:e.target.value})} required/></label></div><label>Notes <span className="optional">OPTIONAL</span><textarea rows="2" value={examForm.notes} onChange={e=>setExamForm({...examForm,notes:e.target.value})}/></label><button className="primary" disabled={busy || !subjects.length}><Plus size={15}/> Add exam</button>{!subjects.length&&<small className="study-hint">Add a subject first to create an exam.</small>}</form></div><div className="study-panel"><div className="study-panel-head"><div><h2>Your exams</h2><p>Generate a daily revision target from today until each exam.</p></div></div>{exams.length ? <div className="study-list">{[...exams].sort((a,b)=>a.exam_date.localeCompare(b.exam_date)).map(exam=><div className="study-exam-row" key={exam.id}><div className="study-exam-date"><b>{new Date(`${exam.exam_date}T12:00:00`).getDate()}</b><span>{new Date(`${exam.exam_date}T12:00:00`).toLocaleDateString('en-GB',{month:'short'})}</span></div><div className="study-row-main"><b>{exam.title}</b><span>{subjectNameFor(exam.subject_id)} · {exam.target_hours}h target</span></div><button className="secondary compact" onClick={()=>planRevision(exam)} disabled={busy}><RefreshCw size={14}/> Plan hours</button><button className="study-delete" onClick={()=>remove('exams',exam.id,setExams,exams)}><Trash2 size={15}/></button></div>)}</div> : <Empty text="Add your exam dates above to start planning revision."/>}</div><div className="study-panel"><div className="study-panel-head"><div><h2>Revision schedule & history</h2><p>Planned and completed sessions. Revision is tracked separately from homework.</p></div></div>{upcomingSessions.length ? <div className="study-list">{upcomingSessions.map(s=><div className="study-list-row" key={s.id}><div className="study-row-main"><b>{subjectNameFor(s.subject_id)}</b><span>{dateLabel(s.planned_date)} · {minsLabel(s.planned_minutes)}</span></div><button className={`status-button ${s.status==='done'?'done':''}`} onClick={()=>update('revision_sessions',s.id,{status:s.status==='done'?'planned':'done',completed_minutes:s.status==='done'?0:s.planned_minutes},setSessions,sessions)}>{s.status==='done'?'Completed':'Mark complete'}</button></div>)}</div> : <Empty text="No revision has been scheduled yet. Use Plan hours on an exam above."/>}</div></>}

    {tab === 'papers' && <><div className="study-panel"><div className="study-panel-head"><div><h2>Record a paper or test</h2><p>Keep the score and time taken for every attempt.</p></div></div><form className="study-form" onSubmit={addPaper}><label>Subject<select value={paperForm.subject_id} onChange={e=>setPaperForm({...paperForm,subject_id:e.target.value})} required>{subjectOptions}{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Paper / test name<input value={paperForm.title} onChange={e=>setPaperForm({...paperForm,title:e.target.value})} placeholder="e.g. Edexcel 2023 Paper 1" required/></label><div className="study-form-row three"><label>Date completed<input type="date" value={paperForm.completed_date} onChange={e=>setPaperForm({...paperForm,completed_date:e.target.value})} required/></label><label>Marks achieved<input type="number" min="0" value={paperForm.score} onChange={e=>setPaperForm({...paperForm,score:e.target.value})} required/></label><label>Maximum marks<input type="number" min="1" value={paperForm.max_marks} onChange={e=>setPaperForm({...paperForm,max_marks:e.target.value})} required/></label></div><div className="study-form-row"><label>Time taken (minutes)<input type="number" min="1" value={paperForm.duration_minutes} onChange={e=>setPaperForm({...paperForm,duration_minutes:e.target.value})} required/></label><label>Exam board <span className="optional">OPTIONAL</span><input value={paperForm.exam_board} onChange={e=>setPaperForm({...paperForm,exam_board:e.target.value})} placeholder="e.g. Edexcel"/></label></div><button className="primary" disabled={busy || !subjects.length}><Plus size={15}/> Save result</button></form></div><div className="study-panel"><div className="study-panel-head"><div><h2>Past paper history</h2><p>{papers.length} recorded attempts · {scoreAverage}% average</p></div></div>{sortedPapers.length ? <div className="study-list">{[...sortedPapers].reverse().map(p=><div className="study-list-row" key={p.id}><div className="study-row-main"><b>{p.title}</b><span>{subjectNameFor(p.subject_id)} · {dateLabel(p.completed_date)} · {p.duration_minutes} min</span></div><strong>{p.score}/{p.max_marks} ({Math.round(p.score/p.max_marks*100)}%)</strong><button className="study-delete" onClick={()=>remove('past_papers',p.id,setPapers,papers)}><Trash2 size={15}/></button></div>)}</div> : <Empty text="Your recorded papers and tests will appear here."/>}</div></>}

    {tab === 'errors' && <><div className="study-panel"><div className="study-panel-head"><div><h2>Log an error</h2><p>Capture what went wrong and what you will do differently next time.</p></div></div><form className="study-form" onSubmit={addError}><label>Subject<select value={errorForm.subject_id} onChange={e=>setErrorForm({...errorForm,subject_id:e.target.value,past_paper_id:''})} required>{subjectOptions}{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Related paper <span className="optional">OPTIONAL</span><select value={errorForm.past_paper_id} onChange={e=>setErrorForm({...errorForm,past_paper_id:e.target.value})}><option value="">Not linked to a paper</option>{papers.filter(p=>p.subject_id===errorForm.subject_id).map(p=><option key={p.id} value={p.id}>{p.title} · {dateLabel(p.completed_date)}</option>)}</select></label><div className="study-form-row"><label>Question / reference<input value={errorForm.question} onChange={e=>setErrorForm({...errorForm,question:e.target.value})} placeholder="e.g. Q6(b)" required/></label><label>Topic<input value={errorForm.topic} onChange={e=>setErrorForm({...errorForm,topic:e.target.value})} placeholder="e.g. Integration"/></label></div><label>Type of error<select value={errorForm.error_type} onChange={e=>setErrorForm({...errorForm,error_type:e.target.value})}><option>Knowledge gap</option><option>Method / process</option><option>Misread question</option><option>Algebra / arithmetic</option><option>Timing</option><option>Exam technique</option><option>Other</option></select></label><label>Correction / lesson learned<textarea rows="3" value={errorForm.correction} onChange={e=>setErrorForm({...errorForm,correction:e.target.value})} placeholder="What was the correct approach? What will you remember?"/></label><button className="primary" disabled={busy || !subjects.length}><Plus size={15}/> Add to error log</button></form></div><div className="study-panel"><div className="study-panel-head"><div><h2>Your error log</h2><p>Mark an error resolved when you can reliably answer that type of question.</p></div></div>{errors.length ? <div className="study-list">{errors.map(err=><div className="study-error-row" key={err.id}><div className="study-row-main"><b>{subjectNameFor(err.subject_id)} · {err.question}{err.topic ? ` — ${err.topic}` : ''}</b><span>{err.error_type}{err.correction ? ` · ${err.correction}` : ''}</span></div><button className={`status-button ${err.resolved?'done':''}`} onClick={()=>update('errors',err.id,{resolved:!err.resolved},setErrors,errors)}>{err.resolved?'Resolved':'Unresolved'}</button><button className="study-delete" onClick={()=>remove('errors',err.id,setErrors,errors)}><Trash2 size={15}/></button></div>)}</div> : <Empty text="No errors logged yet. Add mistakes from your next paper."/>}</div></>}

    {tab === 'homework' && <><div className="study-panel"><div className="study-panel-head"><div><h2>Add homework</h2><p>Homework has its own tracker and never contributes to your revision completion.</p></div></div><form className="study-form" onSubmit={addHomework}><label>Subject<select value={homeworkForm.subject_id} onChange={e=>setHomeworkForm({...homeworkForm,subject_id:e.target.value})} required>{subjectOptions}{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Homework task<input value={homeworkForm.title} onChange={e=>setHomeworkForm({...homeworkForm,title:e.target.value})} placeholder="e.g. Exercise 7C questions 1–8" required/></label><div className="study-form-row"><label>Deadline<input type="date" value={homeworkForm.deadline} onChange={e=>setHomeworkForm({...homeworkForm,deadline:e.target.value})}/></label><label>Estimated time (minutes)<input type="number" min="5" value={homeworkForm.estimated_minutes} onChange={e=>setHomeworkForm({...homeworkForm,estimated_minutes:e.target.value})}/></label></div><label>Notes <span className="optional">OPTIONAL</span><textarea rows="2" value={homeworkForm.notes} onChange={e=>setHomeworkForm({...homeworkForm,notes:e.target.value})}/></label><button className="primary" disabled={busy || !subjects.length}><Plus size={15}/> Add homework</button></form></div><div className="study-panel"><div className="study-panel-head"><div><h2>Homework to complete</h2><p>{outstandingHomework.length} outstanding · separate from revision progress</p></div></div>{homework.length ? <div className="study-list">{[...homework].sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999')).map(item=><div className="study-list-row" key={item.id}><button className={`study-check ${item.status==='done'?'done':''}`} onClick={()=>update('homework',item.id,{status:item.status==='done'?'todo':'done'},setHomework,homework)}>{item.status==='done'&&<Check size={13}/>}</button><div className="study-row-main"><b className={item.status==='done'?'study-strike':''}>{item.title}</b><span>{subjectNameFor(item.subject_id)} · {minsLabel(item.estimated_minutes)} · {item.deadline ? `Due ${dateLabel(item.deadline)}` : 'No deadline'}</span></div><button className="study-delete" onClick={()=>remove('homework',item.id,setHomework,homework)}><Trash2 size={15}/></button></div>)}</div> : <Empty text="No homework added yet."/>}</div></>}

    {tab === 'analytics' && <><div className="study-metrics"><Metric label="Papers recorded" value={papers.length}/><Metric label="Average score" value={`${scoreAverage}%`}/><Metric label="Errors logged" value={errors.length}/><Metric label="Homework outstanding" value={outstandingHomework.length}/></div><div className="study-panel"><div className="study-panel-head"><div><h2>Score trend</h2><p>Percentage achieved on each recorded paper, by completion date.</p></div></div><TrendChart items={sortedPapers} value={p=>p.score/p.max_marks*100} suffix="%" empty="Record at least one paper to start your score graph."/></div><div className="study-panel"><div className="study-panel-head"><div><h2>Time taken trend</h2><p>Minutes spent on each paper, by completion date.</p></div></div><TrendChart items={sortedPapers} value={p=>p.duration_minutes} suffix=" min" empty="Record papers with their time taken to start your timing graph."/></div><div className="study-panel"><div className="study-panel-head"><div><h2>Performance by subject</h2><p>Average score across recorded papers for each subject.</p></div></div>{subjects.map(s=>{const rows=papers.filter(p=>p.subject_id===s.id);const avg=rows.length?Math.round(rows.reduce((n,p)=>n+p.score/p.max_marks*100,0)/rows.length):0;return <div className="subject-performance" key={s.id}><div><b>{s.name}</b><span>{rows.length} papers</span></div><div className="study-bar"><i style={{width:`${avg}%`}}/></div><strong>{rows.length?`${avg}%`:'—'}</strong></div>})}{!subjects.length&&<Empty text="Add subjects to see a subject-by-subject comparison."/>}</div></>}
  </section>
}

function Empty({ text }) { return <div className="study-empty">{text}</div> }
function Metric({ label, value }) { return <div className="study-metric"><span>{label}</span><b>{value}</b></div> }
function TrendChart({ items, value, suffix, empty }) {
  if (!items.length) return <Empty text={empty}/>
  const width=720, height=210, pad=34, values=items.map(value), max=Math.max(...values,1), min=Math.min(0,...values), range=max-min || 1
  const pts=values.map((v,i)=>({x:pad+(items.length===1?0:i*(width-pad*2)/(items.length-1)),y:height-pad-(v-min)/range*(height-pad*2),v}))
  const line=pts.map(p=>`${p.x},${p.y}`).join(' ')
  return <div className="trend-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend graph"><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="chart-axis"/><line x1={pad} y1={pad} x2={pad} y2={height-pad} className="chart-axis"/><polyline points={line} className="chart-line"/>{pts.map((p,i)=><g key={items[i].id}><circle cx={p.x} cy={p.y} r="4" className="chart-point"/><text x={p.x} y={p.y-11} textAnchor="middle" className="chart-value">{Math.round(p.v*10)/10}{suffix}</text><text x={p.x} y={height-9} textAnchor="middle" className="chart-date">{new Date(`${items[i].completed_date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</text></g>)}</svg></div>
}
