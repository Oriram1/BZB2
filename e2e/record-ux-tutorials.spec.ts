// Records the UX-upgrade tutorial reels (list, apply, create, candidates, payment)
// Records the review-system tutorial reels against a LOCAL Supabase stack with
// seeded demo users (controlled authentic capture). Run only on purpose:
//   RECORD_TUTORIALS=1 zsh scripts/task-completion-e2e.sh e2e/record-ux-tutorials.spec.ts --project=mobile-chrome
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');
const OUT = 'tutorial-videos/ux';
const WORK = '/tmp/bzb-reels-ux';
const EDGE_TTS = '/Library/Frameworks/Python.framework/Versions/3.12/bin/edge-tts';
const VOICE = 'he-IL-HilaNeural';
const PASSWORD = `Demo-${crypto.randomUUID()}!`;

type Beat = { say: string; act?: () => Promise<void> };
type User = { id: string; email: string; client: ReturnType<typeof createClient> };

const admin = api && service ? createClient(api, service, { auth: { persistSession: false } }) : undefined;
const created: string[] = [];
const tasks: string[] = [];

async function makeUser(role: 'tasker' | 'bee' | 'admin', first: string, last: string): Promise<User> {
  const email = `reel-${crypto.randomUUID()}@example.test`;
  const res = await admin!.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: first, last_name: last } });
  expect(res.error).toBeNull();
  const id = res.data.user!.id;
  created.push(id);
  expect((await admin!.from('user_roles').insert({ user_id: id, role })).error).toBeNull();
  const client = createClient(api!, anon!, { auth: { persistSession: false } });
  expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  return { id, email, client };
}

async function approveIfPending(mod: User, id: string) {
  // Text-free good reviews publish on their own; only the rest wait for the screen or a person.
  const row = await admin!.from('reviews').select('status').eq('id', id).single();
  if (row.data?.status === 'pending') expect((await mod.client.rpc('admin_set_review_status', { _review_id: id, _status: 'approved' })).error).toBeNull();
}

async function completedTask(owner: User, worker: User, name: string) {
  const t = await admin!.from('tasks').insert({ creator_id: owner.id, name, short_desc: 'עזרה בבית', category: 'housework', payment: 80, workers_needed: 1, publish_state: 'live' }).select('id').single();
  expect(t.error).toBeNull();
  const taskId = t.data!.id as string;
  tasks.push(taskId);
  await admin!.from('tasks').update({ publish_state: 'live' }).eq('id', taskId);
  const app = await worker.client.from('task_applications').insert({ task_id: taskId, applicant_id: worker.id }).select('id').single();
  expect(app.error).toBeNull();
  expect((await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', app.data!.id)).error).toBeNull();
  expect((await owner.client.rpc('complete_task', { _task_id: taskId })).error).toBeNull();
  return taskId;
}

async function loginState(browser: Browser, email: string, project: Record<string, unknown>) {
  const ctx = await browser.newContext(project);
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
  await page.reload();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

function speak(name: string, i: number, text: string) {
  const file = `${WORK}/${name}-${i}.mp3`;
  execFileSync(EDGE_TTS, ['--voice', VOICE, '--rate=+4%', '--text', text, '--write-media', file]);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  return { file, dur };
}

/** Records one reel. Each beat performs its action while the line is spoken. */
async function record(browser: Browser, project: Record<string, unknown>, state: Awaited<ReturnType<typeof loginState>>, name: string, beats: Beat[], start: (page: Page) => Promise<void>) {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const clips = beats.map((b, i) => speak(name, i, b.say));
  const dir = `${WORK}/${name}-video`;
  rmSync(dir, { recursive: true, force: true });
  const ctx: BrowserContext = await browser.newContext({ ...project, viewport: { width: 600, height: 1300 }, screen: { width: 600, height: 1300 }, deviceScaleFactor: 1, storageState: state, geolocation: { latitude: 32.0853, longitude: 34.7818 }, permissions: ['geolocation'], recordVideo: { dir, size: { width: 600, height: 1300 } } });
  // Local Google Maps billing is off, which paints an error box over the map. Keep it out of the reels.
  await ctx.route(/maps\.googleapis\.com|maps\.gstatic\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  const t0 = Date.now();
  await start(page);
  await page.waitForTimeout(700);
  const offsets: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    offsets.push(Math.max(0, Date.now() - t0 - 150));
    const began = Date.now();
    await beats[i].act?.();
    const left = clips[i].dur * 1000 + 500 - (Date.now() - began);
    if (left > 0) await page.waitForTimeout(left);
  }
  await page.waitForTimeout(1200);
  await ctx.close();
  const video = `${dir}/${readdirSync(dir).find((f) => f.endsWith('.webm'))}`;
  const inputs = clips.flatMap((c) => ['-i', c.file]);
  const delays = clips.map((_, i) => `[${i + 1}:a]adelay=${offsets[i]}|${offsets[i]}[a${i}]`).join(';');
  const mix = `${delays};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  const vf = '[0:v]scale=-2:1840:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xFFF6DC,setsar=1[vout]';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, ...inputs, '-filter_complex', `${vf};${mix}`, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', `${OUT}/${name}.mp4`]);
}


test.describe('UX upgrade reels', () => {
  test.skip(!process.env.RECORD_TUTORIALS || !api || !anon || !service, 'Set RECORD_TUTORIALS=1 with local Supabase');
  test.setTimeout(300_000);
  test.afterEach(async () => {
    for (const id of tasks.splice(0)) await admin?.from('tasks').delete().eq('id', id);
    for (const id of created.splice(0).reverse()) await admin?.auth.admin.deleteUser(id);
  });

  const pause = (page: Page, ms = 600) => page.waitForTimeout(ms);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  async function liveTask(owner: User, row: Record<string, unknown>) {
    const t = await admin!.from('tasks').insert({ creator_id: owner.id, short_desc: 'עזרה קטנה', category: 'housework', payment: 80, workers_needed: 1, publish_state: 'live', scheduled_date: tomorrow, scheduled_time: '16:00', duration_hours: 2, ...row }).select('id').single();
    expect(t.error).toBeNull();
    tasks.push(t.data!.id as string);
    return t.data!.id as string;
  }

  async function seedBoard(owner: User) {
    const first = await liveTask(owner, { name: 'ניקיון דירה', location: 'דיזנגוף 100, תל אביב', latitude: 32.0795, longitude: 34.7740, payment: 120, short_desc: 'ניקיון כללי לדירת שלושה חדרים' });
    await liveTask(owner, { name: 'הוצאת כלב לטיול', category: 'pets', location: 'בן יהודה 20, תל אביב', latitude: 32.0830, longitude: 34.7690, payment: 40, short_desc: 'טיול של חצי שעה' });
    await liveTask(owner, { name: 'עזרה בשיעורי בית', category: 'tutoring', location: 'רמת גן', latitude: 32.0680, longitude: 34.8240, payment: 90, short_desc: 'חשבון לכיתה ו׳' });
    await liveTask(owner, { name: 'גינון בחצר', category: 'gardening', location: 'רעננה', latitude: 32.1840, longitude: 34.8710, payment: 200, short_desc: 'גיזום ושתילה' });
    return first;
  }

  test('1 find a task', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const bee = await makeUser('bee', 'דניאל', 'לוי');
    await seedBoard(owner);
    const state = await loginState(browser, bee.email, project);
    let page!: Page;
    await record(browser, project, state, 'מציאת-מטלה', [
      { say: 'מחפשים מטלה? בכל כרטיס רואים קודם את מה שמעניין: כמה משלמים, וכמה רחוק.', act: async () => { await expect(page.getByRole('button', { name: /מטלה: ניקיון דירה/ })).toBeVisible({ timeout: 20000 }); } },
      { say: 'אפשר לחפש לפי שם או כתובת.', act: async () => { await page.getByLabel('חיפוש מטלות').pressSequentially('כלב', { delay: 90 }); await pause(page, 900); await page.getByRole('button', { name: 'ניקוי החיפוש' }).click(); } },
      { say: 'ולמיין לפי התשלום הגבוה ביותר, או לפי מי שהכי קרוב אליכם.', act: async () => { await page.getByLabel('מיון').selectOption('price'); await pause(page, 1200); await page.getByLabel('מיון').selectOption('near'); } },
      { say: 'את הטווח בוחרים בלחיצה אחת: שלושה קילומטרים, חמישה, עשרה.', act: async () => { await page.getByRole('button', { name: /מרחק:/ }).click(); await page.getByRole('button', { name: '3 ק״מ' }).click(); await pause(page, 900); await page.getByRole('button', { name: 'הכול' }).click(); } },
      { say: 'מצאתם משהו שמעניין? שומרים אותו בלב, וחוזרים אליו אחר כך.', act: async () => { await page.getByRole('button', { name: 'שמירת המטלה' }).first().click(); await pause(page, 700); await page.getByRole('button', { name: 'מטלות שמורות בלבד' }).click(); } },
      { say: 'לוחצים על הכרטיס כדי לראות את כל הפרטים.', act: async () => { await page.getByRole('button', { name: 'מטלות שמורות בלבד' }).click(); await page.getByRole('button', { name: /מטלה: / }).first().click(); await expect(page.getByText('פורסם על ידי')).toBeVisible(); } },
    ], async (p) => { page = p; await p.goto('/tasks'); });
  });

  test('2 apply', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const bee = await makeUser('bee', 'דניאל', 'לוי');
    const id = await liveTask(owner, { name: 'ניקיון דירה', location: 'דיזנגוף 100, תל אביב', latitude: 32.0795, longitude: 34.7740, payment: 120, full_desc: 'ניקיון כללי: רצפות, חלונות ומטבח.' });
    const state = await loginState(browser, bee.email, project);
    let page!: Page;
    await record(browser, project, state, 'הגשת-מועמדות', [
      { say: 'במסך המטלה, למעלה, רואים את התשלום ומי פרסם, כולל הדירוג שלו.', act: async () => { await expect(page.getByText('פורסם על ידי')).toBeVisible({ timeout: 20000 }); await pause(page, 1500); } },
      { say: 'ממשיכים לגלול לתיאור, למפה ולמועד.', act: async () => { await page.getByRole('heading', { name: 'תיאור המשימה' }).scrollIntoViewIfNeeded(); await pause(page, 1500); } },
      { say: 'מתאים לכם? לוחצים על הכפתור הצף בתחתית.', act: async () => { await page.getByRole('button', { name: /לבצע/ }).click(); } },
      { say: 'עכשיו אפשר לכתוב כמה מילים למפרסם, למה אתם מתאימים. זה לא חובה, אבל זה עוזר להתבלט.', act: async () => { await page.getByLabel(/למה אתם מתאימים/).pressSequentially('גר קרוב, יש לי ניסיון בניקיון, זמין מחר', { delay: 45 }); } },
      { say: 'שולחים, ומיד רואים מה קורה אחר כך.', act: async () => { await page.getByRole('button', { name: 'שליחת מועמדות' }).click(); await expect(page.getByText('המועמדות נשלחה')).toBeVisible(); } },
      { say: 'המפרסם מקבל התראה, ואתם עוקבים אחרי הסטטוס בפעילות שלכם.', act: async () => { await pause(page, 2000); } },
    ], async (p) => { page = p; await p.goto(`/task/${id}`); });
  });

  test('3 create a task', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const state = await loginState(browser, owner.email, project);
    let page!: Page;
    await record(browser, project, state, 'פרסום-מטלה-בשלושה-שלבים', [
      { say: 'לפרסם מטלה? אפשר פשוט לספר לביזי, העוזר, מה צריך. או למלא בעצמכם, ואז זה שלושה שלבים בלבד.', act: async () => { await expect(page.getByRole('button', { name: 'אמלא בעצמי' })).toBeVisible({ timeout: 20000 }); await pause(page, 1800); await page.getByRole('button', { name: 'אמלא בעצמי' }).click(); await page.getByRole('radio', { name: 'עבודות בית', exact: true }).check(); } },
      { say: 'כותבים כותרת ותיאור קצר, ומה התשלום.', act: async () => { await page.getByLabel('מה צריך לעשות?', { exact: true }).pressSequentially('ניקיון דירה', { delay: 55 }); await page.getByLabel('תיאור קצר (עד 120 תווים)', { exact: true }).pressSequentially('ניקיון כללי לדירת שלושה חדרים', { delay: 40 }); await page.getByLabel('תשלום מוצע', { exact: true }).fill('120'); } },
      { say: 'כבר כאן רואים כמה עולה הפרסום, בלי הפתעות בסוף.', act: async () => { await page.getByText('עלות הפרסום').scrollIntoViewIfNeeded(); await pause(page, 1200); } },
      { say: 'בשלב השני קובעים מתי ואיפה, ואפשר להוסיף תמונה והערות.', act: async () => { await page.getByRole('button', { name: 'הבא', exact: true }).click(); await expect(page.getByRole('button', { name: 'מחר', exact: true })).toBeVisible(); } },
      { say: 'תאריך ושעה בלחיצה אחת.', act: async () => { await page.getByRole('button', { name: 'מחר', exact: true }).click(); await pause(page, 500); await page.getByRole('button', { name: '09:00', exact: true }).click(); await page.getByLabel(/כתובת|מיקום/).first().fill('דיזנגוף 100, תל אביב').catch(() => undefined); } },
      { say: 'ובשלב השלישי בודקים הכול, ומפרסמים.', act: async () => { await page.getByRole('button', { name: 'הבא', exact: true }).click(); await pause(page, 2500); } },
    ], async (p) => { page = p; await p.goto('/create-task'); });
  });

  test('4 choose a candidate', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const bee = await makeUser('bee', 'דניאל', 'לוי');
    const id = await liveTask(owner, { name: 'ניקיון דירה', location: 'דיזנגוף 100, תל אביב', latitude: 32.0795, longitude: 34.7740 });
    expect((await bee.client.from('task_applications').insert({ task_id: id, applicant_id: bee.id, message: 'גר קרוב, יש לי ניסיון בניקיון, זמין מחר' })).error).toBeNull();
    const state = await loginState(browser, owner.email, project);
    let page!: Page;
    await record(browser, project, state, 'בחירת-מועמד', [
      { say: 'נכנסים לפעילות, ופותחים את המועמדויות. מי שפרסם מטלה מתחיל ישר מהמטלות שלו.', act: async () => { await expect(page.getByRole('tab', { name: /מועמדויות/ })).toBeVisible({ timeout: 20000 }); await page.getByRole('tab', { name: /מועמדויות/ }).click(); } },
      { say: 'בכל כרטיס רואים את הדירוג, כמה מטלות הושלמו, ומה המועמד כתב.', act: async () => { await expect(page.getByText('מה הם כתבו')).toBeVisible(); await pause(page, 2000); } },
      { say: 'יש שתי פעולות בלבד: אישור או דחייה. כל השאר, כמו צפייה בפרופיל, בתפריט הנקודות.', act: async () => { await page.getByRole('button', { name: /עוד פעולות/ }).click(); await pause(page, 1500); await page.keyboard.press('Escape'); } },
      { say: 'מאשרים, וממשיכים ישר לצ׳אט.', act: async () => { await page.getByRole('button', { name: /אישור וקבלה/ }).click(); await expect(page.getByRole('button', { name: /מעבר לצ׳אט/ })).toBeVisible({ timeout: 15000 }); } },
    ], async (p) => { page = p; await p.goto('/my-tasks'); });
  });

  test('5 pay', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const id = await liveTask(owner, { name: 'ניקיון דירה' });
    expect((await admin!.from('tasks').update({ publish_state: 'pending_payment', payment_due: 8 }).eq('id', id)).error).toBeNull();
    const state = await loginState(browser, owner.email, project);
    let page!: Page;
    await record(browser, project, state, 'תשלום-על-מטלה', [
      { say: 'המטלה אושרה וממתינה לתשלום? יש כפתור אחד, שלם עכשיו.', act: async () => { await expect(page.getByRole('button', { name: 'שלם עכשיו', exact: true })).toBeVisible({ timeout: 20000 }); await pause(page, 1200); } },
      { say: 'לוחצים, ורק עכשיו בוחרים איך לשלם.', act: async () => { await page.getByRole('button', { name: 'שלם עכשיו', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('איך לשלם?'); } },
      { say: 'כרטיס, או תשלום חד-פעמי עם Apple Pay, Google Pay או Bit. בתשלום חד-פעמי הכרטיס לא נשמר.', act: async () => { await pause(page, 3000); } },
    ], async (p) => { page = p; await p.goto('/my-tasks?tab=published'); });
  });
});
