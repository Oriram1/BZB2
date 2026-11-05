// Records the review-system tutorial reels against a LOCAL Supabase stack with
// seeded demo users (controlled authentic capture). Run only on purpose:
//   RECORD_TUTORIALS=1 zsh scripts/task-completion-e2e.sh e2e/record-tutorials.spec.ts --project=mobile-chrome
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');
const OUT = 'tutorial-videos/reviews';
const WORK = '/tmp/bzb-reels';
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
  const ctx: BrowserContext = await browser.newContext({ ...project, viewport: { width: 600, height: 1300 }, screen: { width: 600, height: 1300 }, deviceScaleFactor: 1, storageState: state, recordVideo: { dir, size: { width: 600, height: 1300 } } });
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

test.describe('review tutorial reels', () => {
  test.skip(!process.env.RECORD_TUTORIALS || !api || !anon || !service, 'Set RECORD_TUTORIALS=1 with local Supabase');
  test.setTimeout(300_000);
  test.afterEach(async () => {
    for (const id of tasks.splice(0)) await admin?.from('tasks').delete().eq('id', id);
    for (const id of created.splice(0).reverse()) await admin?.auth.admin.deleteUser(id);
  });

  const pause = (page: Page, ms = 600) => page.waitForTimeout(ms);

  test('1 rate a worker', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    await completedTask(owner, worker, 'ניקיון דירה');
    const state = await loginState(browser, owner.email, project);
    let page!: Page;
    await record(browser, project, state, 'דירוג-הדדי', [
      { say: 'סיימתם מטלה? אפשר לדרג את מי שעבדתם איתו.', act: async () => { await expect(page.getByRole('button', { name: 'דירוג העובד' })).toBeVisible({ timeout: 20000 }); } },
      { say: 'לוחצים על דירוג העובד.', act: async () => { await page.getByRole('button', { name: 'דירוג העובד' }).click(); } },
      { say: 'בוחרים כמה כוכבים.', act: async () => { await pause(page, 500); await page.getByRole('button', { name: '5 כוכבים', exact: true }).click(); } },
      { say: 'אפשר לסמן תגיות, כמו הגיע בזמן, ותקשורת נעימה.', act: async () => { await page.getByRole('button', { name: 'הגיע בזמן' }).click(); await pause(page, 500); await page.getByRole('button', { name: 'תקשורת נעימה' }).click(); } },
      { say: 'ולכתוב כמה מילים, אם בא לכם.', act: async () => { await page.getByPlaceholder('כתוב ביקורת (אופציונלי)...').pressSequentially('עבד מסודר ובזמן, תודה!', { delay: 55 }); } },
      { say: 'ושולחים. הדירוג לא מופיע מיד: הוא מתפרסם אחרי שגם הצד השני דירג, או אחרי ארבעה עשר ימים, ובאישור מנהל.', act: async () => { await page.getByRole('button', { name: 'שלח דירוג', exact: true }).click(); await expect(page.getByRole('button', { name: 'הדירוג נשלח', exact: true })).toBeDisabled(); } },
      { say: 'ככה אף אחד לא מושפע מהדירוג של השני. פשוט ומכבד.' },
    ], async (p) => { page = p; await p.goto('/my-tasks?tab=applications'); });
  });

  test('2 edit before publication', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    const taskId = await completedTask(owner, worker, 'סידור ארון');
    expect((await owner.client.from('reviews').insert({ task_id: taskId, reviewer_id: owner.id, reviewee_id: worker.id, rating: 3, body: 'היה בסדר' })).error).toBeNull();
    const state = await loginState(browser, owner.email, project);
    let page!: Page;
    await record(browser, project, state, 'עריכת-דירוג', [
      { say: 'שלחתם דירוג וחשבתם שוב? כל עוד הוא לא פורסם, אפשר לערוך אותו.', act: async () => { await page.getByRole('button', { name: 'עריכת הדירוג' }).scrollIntoViewIfNeeded(); } },
      { say: 'בפרופיל, מתחת לדירוגים שנתתם, רואים את הסטטוס: ממתין לאישור, או פורסם.', act: async () => { await pause(page, 1500); } },
      { say: 'לוחצים על עריכת הדירוג.', act: async () => { await page.getByRole('button', { name: 'עריכת הדירוג' }).click(); } },
      { say: 'משנים את הכוכבים ואת הטקסט.', act: async () => { await page.getByRole('button', { name: '5 כוכבים', exact: true }).click(); await page.getByPlaceholder('כתוב ביקורת (אופציונלי)...').fill('עבודה מצוינת, ממליצה מאוד'); } },
      { say: 'ושומרים. הדירוג חוזר לבדיקה של מנהל לפני שהוא מתפרסם.', act: async () => { await page.getByRole('button', { name: 'שמירת השינויים' }).click(); await expect(page.getByText('עבודה מצוינת, ממליצה מאוד').first()).toBeVisible(); } },
      { say: 'אחרי הפרסום כבר אי אפשר לערוך, אז כדאי לוודא לפני.' },
    ], async (p) => { page = p; await p.goto('/profile'); });
  });

  async function publishedReview(owner: User, worker: User, mod: User, taskId: string, body: string, tags: string[] = []) {
    expect((await owner.client.from('reviews').insert({ task_id: taskId, reviewer_id: owner.id, reviewee_id: worker.id, rating: 5, body, tags })).error).toBeNull();
    expect((await worker.client.from('reviews').insert({ task_id: taskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 4 })).error).toBeNull();
    const rows = await admin!.from('reviews').select('id').eq('task_id', taskId);
    for (const r of rows.data ?? []) expect((await mod.client.rpc('admin_set_review_status', { _review_id: r.id, _status: 'approved' })).error).toBeNull();
    const pub = await admin!.from('reviews').select('id').eq('task_id', taskId).eq('reviewee_id', worker.id).not('published_at', 'is', null);
    expect(pub.data).toHaveLength(1);
    return pub.data![0].id as string;
  }

  test('3 reply to a review', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    const mod = await makeUser('admin', 'מנהל', 'מערכת');
    const taskId = await completedTask(owner, worker, 'עזרה בהובלה');
    await publishedReview(owner, worker, mod, taskId, 'הגיע בזמן ועבד נקי', ['on_time', 'pleasant']);
    const state = await loginState(browser, worker.email, project);
    let page!: Page;
    await record(browser, project, state, 'תגובה-לביקורת', [
      { say: 'קיבלתם ביקורת? אפשר להגיב לה, פעם אחת.', act: async () => { await expect(page.getByText('הגיע בזמן ועבד נקי')).toBeVisible({ timeout: 20000 }); await page.getByText('הגיע בזמן ועבד נקי').scrollIntoViewIfNeeded(); } },
      { say: 'בפרופיל שלכם, מתחת לכל ביקורת, לוחצים על תגובה לביקורת.', act: async () => { await page.getByRole('button', { name: 'תגובה לביקורת', exact: true }).click(); } },
      { say: 'כותבים תגובה קצרה ועניינית.', act: async () => { await page.getByLabel('תגובה לביקורת').pressSequentially('תודה רבה, היה כיף לעבוד איתך!', { delay: 55 }); } },
      { say: 'התגובה לא משנה את הדירוג. היא עוברת אישור מנהל, ואז מופיעה בפרופיל לצד הביקורת.', act: async () => { await page.getByRole('button', { name: 'שליחת תגובה' }).click(); await expect(page.getByText('ממתינה לאישור', { exact: true })).toBeVisible(); } },
      { say: 'ומי שכתב את הביקורת מקבל על זה התראה.' },
    ], async (p) => { page = p; await p.goto('/profile'); });
  });

  test('4 report a review', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    const mod = await makeUser('admin', 'מנהל', 'מערכת');
    const viewer = await makeUser('bee', 'יעל', 'אברהם');
    const taskId = await completedTask(owner, worker, 'שטיפת חלונות');
    await publishedReview(owner, worker, mod, taskId, 'אפשר להתקשר אליי למספר הזה', ['pleasant']);
    const state = await loginState(browser, viewer.email, project);
    let page!: Page;
    await record(browser, project, state, 'דיווח-על-ביקורת', [
      { say: 'ראיתם ביקורת שלא במקום? אפשר לדווח עליה.', act: async () => { await expect(page.getByText('אפשר להתקשר אליי למספר הזה')).toBeVisible({ timeout: 20000 }); await page.getByText('אפשר להתקשר אליי למספר הזה').scrollIntoViewIfNeeded(); } },
      { say: 'בפרופיל של המשתמש, לוחצים על דיווח על ביקורת.', act: async () => { await page.getByRole('button', { name: 'דיווח על ביקורת' }).click(); } },
      { say: 'בוחרים סיבה, כמו פרטים אישיים, ספאם או תוכן פוגעני.', act: async () => { await page.getByLabel('סיבת הדיווח').selectOption('privacy'); } },
      { say: 'אפשר להוסיף הסבר, ולשלוח.', act: async () => { await page.getByLabel('פרטים נוספים לדיווח').pressSequentially('יש כאן מספר טלפון', { delay: 55 }); } },
      { say: 'הביקורת לא נמחקת אוטומטית. מנהל בודק, ומחליט לפי מדיניות, לא לפי כמה כוכבים יש בה.', act: async () => { await page.getByRole('button', { name: 'שליחת דיווח' }).click(); await expect(page.getByText('הדיווח נשלח לבדיקה')).toBeVisible(); } },
      { say: 'אם החלטה לא נראית לכם, אפשר לערער עליה פעם אחת מהפרופיל שלכם.' },
    ], async (p) => { page = p; await p.goto(`/profile/${worker.id}`); });
  });

  test('5 admin moderation', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    const mod = await makeUser('admin', 'מנהל', 'מערכת');
    const viewer = await makeUser('bee', 'יעל', 'אברהם');
    const t1 = await completedTask(owner, worker, 'גינון בחצר');
    const reviewId = await publishedReview(owner, worker, mod, t1, 'עבודה יפה מאוד', ['thorough']);
    expect((await worker.client.rpc('submit_review_response', { _review_id: reviewId, _body: 'תודה על הדירוג' })).error).toBeNull();
    expect((await viewer.client.rpc('report_review', { _review_id: reviewId, _reason: 'spam', _details: 'נראה כמו פרסום' })).error).toBeNull();
    const t2 = await completedTask(owner, worker, 'צביעת קיר');
    expect((await worker.client.from('reviews').insert({ task_id: t2, reviewer_id: worker.id, reviewee_id: owner.id, rating: 2, body: 'התקשורת הייתה מסובכת' })).error).toBeNull();
    const state = await loginState(browser, mod.email, project);
    let page!: Page;
    await record(browser, project, state, 'מנהל-אישור-ביקורות', [
      { say: 'למנהלים: כל ביקורת, תגובה ודיווח עוברים בדיקה במסך הניהול.', act: async () => { await expect(page.getByRole('heading', { name: 'ביקורות ממתינות לאישור' })).toBeVisible({ timeout: 20000 }); } },
      { say: 'ביקורות ממתינות מופיעות כאן. אפשר לאשר, או לדחות עם סיבה שהכותב יראה.', act: async () => { await pause(page, 1500); } },
      { say: 'נניח שהביקורת הזאת פוגעת. בוחרים דחה, וכותבים מה צריך לתקן.', act: async () => { await page.getByRole('button', { name: 'דחה' }).first().click(); await page.getByLabel('סיבה לדחיית הביקורת').pressSequentially('נא לנסח בלי ביקורת אישית', { delay: 45 }); } },
      { say: 'ממשיכים לתגובות ולדיווחים. כל החלטה דורשת נימוק, וניתנת רק פעם אחת.', act: async () => { await page.getByRole('button', { name: 'אישור דחייה' }).click(); await page.getByRole('heading', { name: 'תגובות לביקורות שממתינות לאישור' }).scrollIntoViewIfNeeded(); } },
      { say: 'ובתחתית יש סימנים לבדיקה ידנית, כמו ביקורות חוזרות בין אותם שני אנשים. אלה רמזים בלבד, בלי חסימה אוטומטית.', act: async () => { await page.getByRole('heading', { name: 'דיווחים וערעורים על ביקורות' }).scrollIntoViewIfNeeded(); await pause(page, 1500); await page.getByRole('heading', { name: 'סימנים לבדיקה ידנית' }).scrollIntoViewIfNeeded(); } },
    ], async (p) => { page = p; await p.goto('/admin?tab=reviews'); });
  });

  test('6 read reviews on a profile', async ({ browser }, info) => {
    const project = info.project.use as Record<string, unknown>;
    const owner = await makeUser('tasker', 'נועה', 'כהן');
    const worker = await makeUser('bee', 'דניאל', 'לוי');
    const mod = await makeUser('admin', 'מנהל', 'מערכת');
    const other = await makeUser('tasker', 'אורי', 'רם');
    const t1 = await completedTask(owner, worker, 'ניקיון מטבח');
    await publishedReview(owner, worker, mod, t1, 'עבודה מצוינת ומסודרת', ['on_time', 'thorough']);
    const t2 = await completedTask(other, worker, 'העברת רהיטים');
    expect((await other.client.from('reviews').insert({ task_id: t2, reviewer_id: other.id, reviewee_id: worker.id, rating: 3, body: 'בסדר, איחר קצת', tags: ['as_agreed'] })).error).toBeNull();
    expect((await worker.client.from('reviews').insert({ task_id: t2, reviewer_id: worker.id, reviewee_id: other.id, rating: 5 })).error).toBeNull();
    const rows = await admin!.from('reviews').select('id').eq('task_id', t2);
    for (const r of rows.data ?? []) await mod.client.rpc('admin_set_review_status', { _review_id: r.id, _status: 'approved' });
    const viewer = await makeUser('bee', 'יעל', 'אברהם');
    const state = await loginState(browser, viewer.email, project);
    let page!: Page;
    await record(browser, project, state, 'איך-קוראים-ביקורות', [
      { say: 'לפני שבוחרים עם מי לעבוד, שווה להציץ בפרופיל.', act: async () => { await expect(page.getByRole('heading', { name: 'דירוג וביקורות' })).toBeVisible({ timeout: 20000 }); await page.getByRole('heading', { name: 'דירוג וביקורות' }).scrollIntoViewIfNeeded(); } },
      { say: 'רואים את הממוצע, ואת מספר הדירוגים שעומדים מאחוריו. ממוצע בלי כמות לא אומר הרבה.', act: async () => { await pause(page, 2500); await page.screenshot({ path: '/tmp/bzb-frames/profile-new.png' }); } },
      { say: 'ההתפלגות מראה כמה אנשים נתנו חמישה כוכבים, ארבעה, ועוד. ואפשר ללחוץ על שורה כדי לסנן.', act: async () => { await page.getByRole('group', { name: /התפלגות דירוגים/ }).scrollIntoViewIfNeeded(); await pause(page, 1500); await page.getByRole('button', { name: /דירוגים של 5 כוכבים/ }).click(); } },
      { say: 'לוחצים שוב כדי לנקות, וממיינים לפי החדשות, הגבוהות או הנמוכות ביותר.', act: async () => { await page.getByRole('button', { name: /כוכבים ✕/ }).click(); await pause(page, 800); await page.getByLabel('מיון').selectOption('lowest'); } },
      { say: 'בכל ביקורת יש גם תגיות, כמו הגיע בזמן, ואם הייתה תגובה, רואים אותה מתחת.', act: async () => { await page.getByText('עבודה מצוינת ומסודרת').scrollIntoViewIfNeeded(); await pause(page, 2000); } },
      { say: 'אפשר לבחור לפי מה שחשוב לכם: הכול ברור, ובלי הפתעות.' },
    ], async (p) => { page = p; await p.goto(`/profile/${worker.id}`); });
  });
});
