import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import {
  CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Flame, LayoutDashboard, ListTodo, LogOut, Moon, MoreHorizontal,
  Plus, Search, Settings2, Sun, Target, Trash2, X, Pencil, Pause, Play,
  AlertCircle, BookOpen, ArrowRight, Sparkles
} from 'lucide-react'
import './style.css'
import StudyHub from './pages/StudyHub'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const todayISO = () => new Date().toLocaleDateString('en-CA')
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+n); return d.toLocaleDateString('en-CA') }
const niceDate = (date, opts={ weekday:'long', day:'numeric', month:'long' }) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', opts)
const mins = n => `${Math.floor(n/60)}h${n%60 ? ` ${n%60}m` : ''}`
const priorityWeight = { high: 3, medium: 2, low: 1 }

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState('today')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('daymark-dark') === 'true')
  const [dailyLimit, setDailyLimit] = useState(() => Number(localStorage.getItem('daymark-limit') || 180))
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setAuthLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadTasks(); else setTasks([]) }, [session])

  async function loadTasks() {
    setLoading(true)
    const { data, error } = await supabase.from('tasks').select('*').order('scheduled_date', { ascending:true, nullsFirst:false }).order('deadline', {ascending:true, nullsFirst:false})
    if (error) notify(error.message); else setTasks(data || [])
    setLoading(false)
  }
  function notify(message) { setToast(message); setTimeout(() => setToast(''), 2800) }

  
async function signIn(e) {
  e.preventDefault()
  setAuthError('')

  const { data, error } = authMode === 'signup'
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    setAuthError(error.message)
  } else if (authMode === 'signup') {
    setAuthError('Check your email to confirm your account, then sign in.')
  }
}

  async function signOut() { await supabase.auth.signOut(); setTasks([]) }

  async function saveTask(values) {
    const payload = { ...values, user_id: session.user.id, updated_at: new Date().toISOString() }
    const result = editing
      ? await supabase.from('tasks').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('tasks').insert(payload).select().single()
    if (result.error) return notify(result.error.message)
    setTasks(old => editing ? old.map(t => t.id === editing.id ? result.data : t) : [...old, result.data])
    setShowModal(false); setEditing(null); notify(editing ? 'Task updated' : 'Task added')
  }
  async function updateTask(id, changes) {
    const { data, error } = await supabase.from('tasks').update({ ...changes, updated_at:new Date().toISOString() }).eq('id', id).select().single()
    if (error) return notify(error.message)
    setTasks(old => old.map(t => t.id === id ? data : t))
  }
  async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return notify(error.message)
    setTasks(old => old.filter(t => t.id !== id)); notify('Task deleted')
  }

  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'paused')
  const todaysTasks = tasks.filter(t => t.scheduled_date === selectedDate && t.status !== 'paused')
  const doneToday = todaysTasks.filter(t => t.status === 'done')
  const plannedMinutes = todaysTasks.reduce((s,t) => s + t.estimated_minutes, 0)
  const completedMinutes = doneToday.reduce((s,t) => s + t.estimated_minutes, 0)
  const progress = plannedMinutes ? Math.round(completedMinutes / plannedMinutes * 100) : 0
  const filtered = (page === 'today' ? todaysTasks : tasks.filter(t => t.status !== 'paused'))
    .filter(t => `${t.title} ${t.subject}`.toLowerCase().includes(query.toLowerCase()))
  const week = Array.from({length:7}, (_,i) => addDays(selectedDate, i - new Date(`${selectedDate}T12:00:00`).getDay() + 1))
  const overdue = activeTasks.filter(t => t.deadline && t.deadline < todayISO())

  function autoPlan() {
    const pending = [...activeTasks].sort((a,b) => {
      const da = a.deadline || '9999-12-31', db = b.deadline || '9999-12-31'
      return da.localeCompare(db) || priorityWeight[b.priority]-priorityWeight[a.priority]
    })
    const planned = new Map()
    const load = {}
    pending.forEach(task => {
      let day = todayISO()
      const last = task.deadline || addDays(todayISO(), 13)
      let guard = 0
      while (day <= last && guard++ < 90) {
        if ((load[day] || 0) + task.estimated_minutes <= dailyLimit) break
        day = addDays(day, 1)
      }
      if (day > last) day = last
      load[day] = (load[day] || 0) + task.estimated_minutes
      planned.set(task.id, day)
    })
    Promise.all([...planned].map(([id, scheduled_date]) => updateTask(id, { scheduled_date })))
    notify('Your tasks have been distributed across the coming days')
  }

  function toggleDark() { setDark(v => { localStorage.setItem('daymark-dark', String(!v)); return !v }) }

  if (authLoading) return <div className="loading-screen"><div className="brand-mark">d</div><p>Preparing your day…</p></div>
  if (!supabase) return <div className="setup-screen"><div className="brand-mark">d</div><h1>Connect your workspace</h1><p>Daymark needs your Supabase project URL and publishable key. Add them as environment variables before launching.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code></div>
  if (!session) return <div className="auth-wrap"><div className="auth-card"><div className="brand"><div className="brand-mark">d</div><span>daymark</span></div><div className="eyebrow">YOUR DAY, IN FOCUS</div><h1>{authMode === 'signup' ? 'Create your space.' : 'Welcome back.'}</h1><p className="muted">A calmer way to organise your work, one day at a time.</p><form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6" placeholder="At least 6 characters"/></label>{authError && <div className="auth-error">{authError}</div>}<button className="primary full" type="submit">{authMode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16}/></button></form><p className="switch-auth">{authMode === 'signup' ? 'Already have an account?' : 'New to Daymark?'} <button onClick={()=>{setAuthMode(authMode==='signup'?'signin':'signup');setAuthError('')}}>{authMode==='signup'?'Sign in':'Create an account'}</button></p><div className="auth-foot"><LockIcon/> Your tasks are private to your account.</div></div></div>

  return <div className={`app ${dark ? 'dark' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">d</div><span>daymark</span><span className="beta">PERSONAL</span></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${page==='today'?'active':''}`} onClick={()=>setPage('today')}><LayoutDashboard size={18}/> Today</button>
      <button className={`nav-item ${page==='tasks'?'active':''}`} onClick={()=>setPage('tasks')}><ListTodo size={18}/> All tasks <span className="nav-count">{activeTasks.length}</span></button>
      <button className={`nav-item ${page==='week'?'active':''}`} onClick={()=>setPage('week')}><CalendarDays size={18}/> Week</button>
      <button className={`nav-item ${page==='study'?'active':''}`} onClick={()=>setPage('study')}><BookOpen size={18}/> Study centre</button>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Sparkles size={16}/><b>Small steps add up.</b><span>Keep your plan realistic and your focus steady.</span></div><button className="nav-item" onClick={toggleDark}>{dark?<Sun size={18}/>:<Moon size={18}/>} Appearance</button><button className="nav-item" onClick={()=>setPage('settings')}><Settings2 size={18}/> Settings</button><button className="nav-item" onClick={signOut}><LogOut size={18}/> Sign out</button><div className="account"><div className="avatar">{session.user.email?.[0]?.toUpperCase()}</div><div><b>{session.user.email}</b><span>Personal workspace</span></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <ChevronRight size={14}/> <b>{page==='today'?'Today':page==='tasks'?'All tasks':page==='week'?'Week':page==='study'?'Study centre':'Settings'}</b></div><div className="top-actions"><div className="date-chip"><CalendarDays size={15}/>{niceDate(todayISO(),{day:'numeric',month:'short',year:'numeric'})}</div><button className="icon-btn" title="Toggle theme" onClick={toggleDark}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></div></header>
      {page==='study' ? <StudyHub supabase={supabase} userId={session.user.id} notify={notify}/>
      : page==='settings' ? <section className="content"><div className="page-heading"><div><div className="eyebrow">PREFERENCES</div><h1>Settings</h1><p className="muted">Make your daily plan fit your time.</p></div></div><div className="settings-card"><h3>Daily workload target</h3><p className="muted">The planner will try to keep each day within this limit.</p><div className="limit-row"><input type="range" min="60" max="480" step="30" value={dailyLimit} onChange={e=>{setDailyLimit(+e.target.value);localStorage.setItem('daymark-limit',e.target.value)}}/><b>{mins(dailyLimit)}</b></div><div className="settings-note"><AlertCircle size={16}/> This is a planning guide, not a strict limit. Tasks with approaching deadlines may be placed on a fuller day.</div></div><div className="settings-card"><h3>Account</h3><p className="muted">{session.user.email}</p><button className="secondary" onClick={signOut}>Sign out</button></div></section>
      : page==='week' ? <section className="content"><div className="page-heading"><div><div className="eyebrow">YOUR OVERVIEW</div><h1>This week</h1><p className="muted">A clear view of what’s coming up.</p></div><button className="primary" onClick={autoPlan}><Sparkles size={16}/> Auto-plan tasks</button></div><div className="week-grid">{week.map(day=>{const dayTasks=tasks.filter(t=>t.scheduled_date===day&&t.status!=='paused');return <div className={`week-day ${day===todayISO()?'is-today':''}`} key={day} onClick={()=>{setSelectedDate(day);setPage('today')}}><div className="week-day-head"><span>{new Date(`${day}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short'})}</span><b>{new Date(`${day}T12:00:00`).getDate()}</b></div><div className="week-load">{mins(dayTasks.reduce((s,t)=>s+t.estimated_minutes,0))}</div>{dayTasks.slice(0,4).map(t=><div className={`week-task ${t.status==='done'?'is-done':''}`} key={t.id}><i className={`priority-dot ${t.priority}`}/>{t.title}</div>)}{dayTasks.length>4&&<small>+{dayTasks.length-4} more</small>}</div>})}</div></section>
      : <section className="content"><div className="page-heading"><div><div className="eyebrow">{page==='today'?'YOUR DAILY PLAN':'YOUR WORKSPACE'}</div><h1>{page==='today'?(selectedDate===todayISO()?'Today':niceDate(selectedDate)): 'All tasks'}</h1><p className="muted">{page==='today'?'Make progress at your own pace.':'Everything you need to keep moving forward.'}</p></div><button className="primary" onClick={()=>{setEditing(null);setShowModal(true)}}><Plus size={17}/> Add task</button></div>
        {page==='today'&&<><div className="date-nav"><button className="icon-btn" onClick={()=>setSelectedDate(addDays(selectedDate,-1))}><ChevronLeft size={18}/></button><span>{niceDate(selectedDate)}</span><button className="icon-btn" onClick={()=>setSelectedDate(addDays(selectedDate,1))}><ChevronRight size={18}/></button><button className="today-link" onClick={()=>setSelectedDate(todayISO())}>Go to today</button></div><div className="overview-grid"><div className="progress-card"><div className="progress-copy"><span className="card-label">DAILY COMPLETION</span><h2>{progress}<small>%</small></h2><p>{completedMinutes ? `${mins(completedMinutes)} completed` : 'Your progress starts with one task'} <span>of {mins(plannedMinutes)}</span></p></div><div className="progress-ring" style={{'--progress':`${progress*3.6}deg`}}><div>{progress}%</div></div></div><div className="stat-card"><div className="stat-icon purple"><Target size={19}/></div><span className="card-label">PLANNED TODAY</span><h2>{todaysTasks.length}<small> tasks</small></h2><p>{mins(plannedMinutes)} of planned work</p></div><div className="stat-card"><div className="stat-icon amber"><Flame size={19}/></div><span className="card-label">TO KEEP IN MIND</span><h2>{overdue.length}<small> overdue</small></h2><p>{overdue.length?'Review your past deadlines':'You’re all caught up'}</p></div></div></>}
        <div className="task-toolbar"><div className="section-title"><h2>{page==='today'?'Your tasks':'Task list'}</h2><span>{filtered.length} items</span></div><div className="toolbar-actions"><div className="search-box"><Search size={15}/><input placeholder="Search tasks" value={query} onChange={e=>setQuery(e.target.value)}/></div>{page==='today'&&<button className="secondary compact" onClick={autoPlan}><Sparkles size={15}/> Auto-plan</button>}</div></div>
        {loading?<div className="empty-state">Loading your tasks…</div>:filtered.length===0?<div className="empty-state"><div className="empty-icon"><CheckCircle2 size={24}/></div><h3>{page==='today'?'Nothing planned for this day':'No tasks yet'}</h3><p>{page==='today'?'Add a task or use Auto-plan to organise your workload.':'Add your first task to start building your plan.'}</p><button className="secondary" onClick={()=>{setEditing(null);setShowModal(true)}}><Plus size={16}/> Add a task</button></div>:<div className="task-list">{filtered.map(task=><TaskRow key={task.id} task={task} onToggle={()=>updateTask(task.id,{status:task.status==='done'?'todo':'done'})} onEdit={()=>{setEditing(task);setShowModal(true)}} onDelete={()=>deleteTask(task.id)} onPause={()=>updateTask(task.id,{status:task.status==='paused'?'todo':'paused'})}/>)}</div>}
      </section>}
      <footer className="footer">Made for focus, not pressure <span>·</span> Your progress is yours.</footer>
    </main>
    {showModal&&<TaskModal task={editing} onClose={()=>{setShowModal(false);setEditing(null)}} onSave={saveTask}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}

function LockIcon(){return <span className="lock-icon">●</span>}
function TaskRow({task,onToggle,onEdit,onDelete,onPause}) {
  const [menu,setMenu] = useState(false)
  return <article className={`task-row ${task.status==='done'?'completed':''}`}><button className={`task-check ${task.status==='done'?'checked':''}`} onClick={onToggle} aria-label="Toggle completion">{task.status==='done'&&<Check size={14}/>}</button><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`priority-pill ${task.priority}`}>{task.priority}</span></div><div className="task-meta"><span><BookOpen size={13}/>{task.subject}</span><span><Clock3 size={13}/>{mins(task.estimated_minutes)}</span>{task.deadline&&<span className={task.deadline<todayISO()&&task.status!=='done'?'late':''}><CalendarDays size={13}/>{niceDate(task.deadline,{day:'numeric',month:'short'})}</span>}</div>{task.description&&<p className="task-description">{task.description}</p>}</div><div className="task-menu-wrap"><button className="icon-btn" onClick={()=>setMenu(!menu)}><MoreHorizontal size={18}/></button>{menu&&<div className="task-menu"><button onClick={()=>{onEdit();setMenu(false)}}><Pencil size={14}/> Edit</button><button onClick={()=>{onPause();setMenu(false)}}>{task.status==='paused'?<Play size={14}/>:<Pause size={14}/>} {task.status==='paused'?'Resume':'Pause'}</button><button className="danger" onClick={()=>{onDelete();setMenu(false)}}><Trash2 size={14}/> Delete</button></div>}</div></article>
}

function TaskModal({task,onClose,onSave}) {
  const [title,setTitle]=useState(task?.title||'')
  const [subject,setSubject]=useState(task?.subject||'Maths')
  const [description,setDescription]=useState(task?.description||'')
  const [hours,setHours]=useState(task?Math.floor(task.estimated_minutes/60):1)
  const [minutes,setMinutes]=useState(task?task.estimated_minutes%60:0)
  const [deadline,setDeadline]=useState(task?.deadline||'')
  const [priority,setPriority]=useState(task?.priority||'medium')
  const [scheduled,setScheduled]=useState(task?.scheduled_date||todayISO())
  const [saving,setSaving]=useState(false)
  async function submit(e){e.preventDefault();if(!title.trim())return;setSaving(true);await onSave({title:title.trim(),subject,description,estimated_minutes:Math.max(5,Number(hours)*60+Number(minutes)),deadline:deadline||null,priority,status:task?.status||'todo',scheduled_date:scheduled||null});setSaving(false)}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><div><div className="eyebrow">{task?'REFINE YOUR PLAN':'MAKE A PLAN'}</div><h2>{task?'Edit task':'Add a task'}</h2></div><button className="icon-btn" onClick={onClose}><X size={19}/></button></div><form onSubmit={submit}><label>Task name<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Complete mechanics questions" required/></label><div className="form-row"><label>Subject / category<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Maths, Physics…"/></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label>Estimated time</label><div className="time-row"><div><input type="number" min="0" max="24" value={hours} onChange={e=>setHours(e.target.value)}/><span>hours</span></div><div><input type="number" min="0" max="55" step="5" value={minutes} onChange={e=>setMinutes(e.target.value)}/><span>minutes</span></div></div><div className="form-row"><label>Deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Planned day<input type="date" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></label></div><label>Description <span className="optional">OPTIONAL</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows="3" placeholder="Add a note or break the task down…"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':task?'Save changes':'Add task'} <ArrowRight size={15}/></button></div></form></div></div>
}

createRoot(document.getElementById('root')).render(<App />)
