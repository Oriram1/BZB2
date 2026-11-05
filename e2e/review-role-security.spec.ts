import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('review publication, replies, reports, appeals and role security', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!api || !anon || !service, 'Requires local Supabase');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const password = `Test-${crypto.randomUUID()}!`;
  const makeUser = async (role: 'tasker' | 'bee' | 'admin') => {
    const email = `review-${crypto.randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'בדיקה', last_name: 'מקומית' } });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    ids.push(id);
    expect((await admin.from('user_roles').insert({ user_id: id, role })).error).toBeNull();
    const client = createClient(api!, anon!, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    return { id, email, client };
  };
  const login = async (target: Page, email: string) => {
    await target.goto('/login');
    await target.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await target.reload();
    await target.locator('input[type=email]').fill(email);
    await target.locator('input[type=password]').fill(password);
    await target.locator('button[type=submit]').click();
    await expect(target).toHaveURL(/\/tasks$/, { timeout: 20_000 });
  };
  const workerContext = await browser.newContext({ ...testInfo.project.use });
  const moderatorContext = await browser.newContext({ ...testInfo.project.use });
  const ownerContext = await browser.newContext({ ...testInfo.project.use });
  const ownerPage = await ownerContext.newPage();
  const workerPage = await workerContext.newPage();
  const moderatorPage = await moderatorContext.newPage();
  let taskId: string | undefined;
  let expiryTaskId: string | undefined;
  try {
    const owner = await makeUser('tasker');
    const worker = await makeUser('bee');
    const moderator = await makeUser('admin');
    const outsider = await makeUser('bee');
    const task = await admin.from('tasks').insert({ creator_id: owner.id, name: 'בדיקת דירוגים', short_desc: 'בדיקה מקומית', category: 'housework', payment: 50, workers_needed: 1, publish_state: 'live' }).select('id').single();
    expect(task.error).toBeNull();
    taskId = task.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'live' }).eq('id', taskId)).error).toBeNull();
    const application = await worker.client.from('task_applications').insert({ task_id: taskId, applicant_id: worker.id }).select('id').single();
    expect(application.error).toBeNull();
    expect((await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', application.data!.id)).error).toBeNull();
    expect((await owner.client.rpc('complete_task', { _task_id: taskId })).error).toBeNull();
    const modified = await owner.client.from('tasks').update({ review_window_started_at: '2000-01-01T00:00:00Z' }).eq('id', taskId).select('review_window_started_at').single();
    expect(modified.error).toBeNull();
    expect(new Date(modified.data!.review_window_started_at).getUTCFullYear()).toBeGreaterThan(2020);
    const review = await owner.client.from('reviews').insert({ task_id: taskId, reviewer_id: owner.id, reviewee_id: worker.id, rating: 4, body: 'היה בסדר', reviewee_role: 'tasker', published_at: new Date().toISOString() }).select('id, reviewee_role, published_at').single();
    expect(review.error).toBeNull();
    expect(review.data?.reviewee_role).toBe('bee');
    expect(review.data?.published_at).toBeNull();
    expect((await owner.client.rpc('admin_set_review_status', { _review_id: review.data!.id, _status: 'approved' })).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_set_review_status', { _review_id: review.data!.id, _status: 'approved' })).error).toBeNull();
    expect((await moderator.client.rpc('admin_set_review_status', { _review_id: review.data!.id, _status: 'rejected' })).error).not.toBeNull();
    expect((await worker.client.rpc('edit_unpublished_review', { _review_id: review.data!.id, _rating: 1, _body: 'לא מורשה' })).error).not.toBeNull();
    expect((await owner.client.rpc('edit_unpublished_review', { _review_id: review.data!.id, _rating: 4, _body: 'עודכן לפני הפרסום' })).error).toBeNull();
    expect((await owner.client.from('reviews').select('status,body').eq('id', review.data!.id).single()).data).toEqual({ status: 'pending', body: 'עודכן לפני הפרסום' });
    expect((await moderator.client.rpc('admin_set_review_status', { _review_id: review.data!.id, _status: 'approved' })).error).toBeNull();
    const hidden = await outsider.client.from('reviews').select('id').eq('id', review.data!.id);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    const before = await admin.from('notifications').select('id').eq('event_type', 'review_approved').eq('user_id', worker.id);
    expect(before.data).toEqual([]);
    const other = await worker.client.from('reviews').insert({ task_id: taskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5, body: 'תגובה חיובית' }).select('id').single();
    expect(other.error).toBeNull();
    const after = await outsider.client.from('reviews').select('id').eq('id', review.data!.id);
    expect(after.data).toEqual([{ id: review.data!.id }]);
    expect((await owner.client.rpc('edit_unpublished_review', { _review_id: review.data!.id, _rating: 1, _body: 'שינוי אחרי פרסום' })).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_set_review_status', { _review_id: other.data!.id, _status: 'approved' })).error).toBeNull();
    const notices = await admin.from('notifications').select('id').eq('event_type', 'review_approved').eq('user_id', worker.id);
    expect(notices.data).toHaveLength(1);
    const ratings = await worker.client.from('user_role_ratings').select('reviewee_role, avg_rating, review_count').eq('user_id', worker.id);
    expect(ratings.error).toBeNull();
    expect(ratings.data).toEqual([{ reviewee_role: 'bee', avg_rating: 4, review_count: 1 }]);
    expect((await outsider.client.rpc('submit_review_response', { _review_id: review.data!.id, _body: 'לא שלי' })).error).not.toBeNull();
    await login(workerPage, worker.email);
    await workerPage.goto('/profile');
    await workerPage.getByRole('button', { name: 'תגובה לביקורת', exact: true }).click();
    await workerPage.getByLabel('תגובה לביקורת').fill('תודה על המשוב');
    await workerPage.screenshot({ path: testInfo.outputPath('review-response.png'), fullPage: true, animations: 'disabled' });
    await workerPage.getByRole('button', { name: 'שליחת תגובה' }).click();
    await expect(workerPage.getByText('נבדקת לפני פרסום', { exact: true })).toBeVisible();
    const pendingResponse = await admin.from('review_responses').select('id').eq('review_id', review.data!.id).single();
    expect(pendingResponse.error).toBeNull();
    expect((await outsider.client.from('review_responses').select('id').eq('id', pendingResponse.data!.id)).data).toEqual([]);
    await login(moderatorPage, moderator.email);
    await moderatorPage.goto('/admin?tab=reviews');
    await expect(moderatorPage.getByRole('heading', { name: 'תגובות לביקורות שממתינות לבדיקה' })).toBeVisible();
    const responseItem = moderatorPage.getByRole('listitem').filter({ hasText: 'תודה על המשוב' });
    await responseItem.scrollIntoViewIfNeeded();
    await moderatorPage.screenshot({ path: testInfo.outputPath('review-admin.png'), fullPage: false, animations: 'disabled' });
    await responseItem.getByRole('button', { name: 'אישור תגובה' }).click();
    await expect(responseItem).toHaveCount(0);
    expect((await outsider.client.from('review_responses').select('body').eq('id', pendingResponse.data!.id)).data).toEqual([{ body: 'תודה על המשוב' }]);
    const responseNotice = await admin.from('notifications').select('link').eq('event_type', 'review_response_approved').eq('user_id', owner.id);
    expect(responseNotice.data).toEqual([{ link: `/profile/${worker.id}` }]);
    expect((await moderator.client.rpc('admin_moderate_review_response', { _response_id: pendingResponse.data!.id, _status: 'rejected' })).error).not.toBeNull();
    expect((await worker.client.rpc('submit_review_response', { _review_id: review.data!.id, _body: 'תגובה שעודכנה' })).error).toBeNull();
    expect((await outsider.client.from('review_responses').select('id').eq('id', pendingResponse.data!.id)).data).toEqual([]);
    await login(page, outsider.email);
    await page.goto(`/profile/${worker.id}`);
    await expect(page.getByText('עודכן לפני הפרסום')).toBeVisible();
    const reviewItem = page.getByRole('listitem').filter({ hasText: 'עודכן לפני הפרסום' });
    await reviewItem.getByRole('button', { name: 'דיווח על ביקורת' }).click();
    await page.getByLabel('סיבת הדיווח').selectOption('privacy');
    await page.getByLabel('פרטים נוספים לדיווח').fill('פרט מזהה');
    await page.screenshot({ path: testInfo.outputPath('review-report.png'), fullPage: false, animations: 'disabled' });
    await page.getByRole('button', { name: 'שליחת דיווח' }).click();
    await expect(page.getByText('הדיווח נשלח לבדיקה')).toBeVisible();
    expect((await outsider.client.rpc('report_review', { _review_id: review.data!.id, _reason: 'privacy' })).error).not.toBeNull();
    const report = await outsider.client.from('review_reports').select('id,status').eq('review_id', review.data!.id).single();
    expect(report.data?.status).toBe('pending');
    expect((await worker.client.from('review_reports').select('id').eq('id', report.data!.id)).data).toEqual([]);
    expect((await worker.client.rpc('admin_resolve_review_report', { _report_id: report.data!.id, _decision: 'keep', _note: 'נבדק' })).error).not.toBeNull();
    await moderatorPage.reload();
    const reportItem = moderatorPage.getByRole('listitem').filter({ hasText: 'פרט מזהה' });
    await reportItem.getByLabel('נימוק החלטה לדיווח').fill('לא נמצאה הפרה');
    await reportItem.getByRole('button', { name: 'השארת הביקורת' }).click();
    await expect(reportItem).toHaveCount(0);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'ערעור על ההחלטה' }).click();
    await expect(page.getByText('הערעור נשלח לבדיקה')).toBeVisible();
    expect((await outsider.client.rpc('appeal_review_report', { _report_id: report.data!.id })).error).not.toBeNull();
    await moderatorPage.reload();
    const appealedReport = moderatorPage.getByRole('listitem').filter({ hasText: 'ערעור - פרטים אישיים' });
    await appealedReport.getByLabel('נימוק החלטה לדיווח').fill('נמצא פרט אישי');
    await appealedReport.getByRole('button', { name: 'הסרת הביקורת' }).click();
    await expect(appealedReport).toHaveCount(0);
    expect((await outsider.client.from('reviews').select('id').eq('id', review.data!.id)).data).toEqual([]);
    expect((await owner.client.from('reviews').select('rejection_reason').eq('id', review.data!.id).single()).data?.rejection_reason).toBe('נמצא פרט אישי');
    expect((await worker.client.rpc('appeal_review_decision', { _review_id: review.data!.id, _reason: 'לא שלי' })).error).not.toBeNull();
    await login(ownerPage, owner.email);
    await ownerPage.goto('/profile');
    const rejectedReview = ownerPage.locator('div').filter({ hasText: /^בדיקת דירוגים/ }).filter({ hasText: 'נמצא פרט אישי' }).last();
    await rejectedReview.getByRole('button', { name: 'ערעור על ההחלטה' }).click();
    const appealDialog = ownerPage.getByRole('dialog');
    await appealDialog.getByLabel('נימוק הערעור').fill('אשמח לבדיקה נוספת');
    await appealDialog.getByRole('button', { name: 'שליחת ערעור' }).click();
    await expect(ownerPage.getByText('הערעור נשלח לבדיקה')).toBeVisible();
    expect((await owner.client.rpc('appeal_review_decision', { _review_id: review.data!.id, _reason: 'ערעור נוסף' })).error).not.toBeNull();
    const appeal = await owner.client.from('review_appeals').select('id').eq('review_id', review.data!.id).single();
    expect(appeal.error).toBeNull();
    expect((await worker.client.from('review_appeals').select('id').eq('id', appeal.data!.id)).data).toEqual([]);
    await moderatorPage.reload();
    const authorAppeal = moderatorPage.getByRole('listitem').filter({ hasText: 'אשמח לבדיקה נוספת' });
    await authorAppeal.getByLabel('נימוק החלטה לערעור').fill('אושר לאחר בדיקה');
    await authorAppeal.getByRole('button', { name: 'אישור הביקורת' }).click();
    await expect(authorAppeal).toHaveCount(0);
    expect((await outsider.client.from('reviews').select('id').eq('id', review.data!.id)).data).toEqual([{ id: review.data!.id }]);
    expect((await admin.from('notifications').select('id').eq('event_type', 'review_appeal_resolved').eq('user_id', owner.id)).data).toHaveLength(1);

    // Simulate the deadline for a separate isolated task, without waiting 14 days.
    const expiryTask = await admin.from('tasks').insert({ creator_id: owner.id, name: 'בדיקת סיום חלון דירוג', short_desc: 'בדיקה מקומית', category: 'housework', payment: 50, workers_needed: 1, publish_state: 'live' }).select('id').single();
    expect(expiryTask.error).toBeNull();
    expiryTaskId = expiryTask.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'live' }).eq('id', expiryTaskId)).error).toBeNull();
    const expiryApplication = await worker.client.from('task_applications').insert({ task_id: expiryTaskId, applicant_id: worker.id }).select('id').single();
    expect(expiryApplication.error).toBeNull();
    expect((await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', expiryApplication.data!.id)).error).toBeNull();
    expect((await owner.client.rpc('complete_task', { _task_id: expiryTaskId })).error).toBeNull();
    const lone = await owner.client.from('reviews').insert({ task_id: expiryTaskId, reviewer_id: owner.id, reviewee_id: worker.id, rating: 3, body: 'ביקורת לבדיקה' }).select('id').single();
    expect(lone.error).toBeNull();
    expect((await moderator.client.rpc('admin_moderate_review', { _review_id: lone.data!.id, _status: 'rejected', _reason: '' })).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_moderate_review', { _review_id: lone.data!.id, _status: 'rejected', _reason: 'נא להסיר פרטים אישיים' })).error).toBeNull();
    expect((await owner.client.from('reviews').select('status,rejection_reason').eq('id', lone.data!.id).single()).data).toEqual({ status: 'rejected', rejection_reason: 'נא להסיר פרטים אישיים' });
    expect((await owner.client.rpc('appeal_review_decision', { _review_id: lone.data!.id, _reason: 'נא לבדוק שוב' })).error).toBeNull();
    expect((await owner.client.rpc('edit_unpublished_review', { _review_id: lone.data!.id, _rating: 3, _body: 'תיקון בזמן ערעור' })).error).not.toBeNull();
    const rejectedAppeal = await owner.client.from('review_appeals').select('id').eq('review_id', lone.data!.id).single();
    expect((await moderator.client.rpc('admin_resolve_review_appeal', { _appeal_id: rejectedAppeal.data!.id, _decision: 'keep_removed', _note: 'יש לתקן את הטקסט' })).error).toBeNull();
    expect((await owner.client.rpc('edit_unpublished_review', { _review_id: lone.data!.id, _rating: 3, _body: 'תוקן' })).error).toBeNull();
    expect((await moderator.client.rpc('admin_set_review_status', { _review_id: lone.data!.id, _status: 'approved' })).error).toBeNull();
    expect((await outsider.client.from('reviews').select('id').eq('id', lone.data!.id)).data).toEqual([]);
    expect((await admin.from('reviews').update({ blind_until: '2000-01-01T00:00:00Z' }).eq('id', lone.data!.id)).error).toBeNull();
    const project = process.env.SUPABASE_PROJECT_REF;
    if (!project || !/^[a-z0-9]+$/.test(project)) throw new Error('Invalid local project ref');
    execFileSync('docker', ['exec', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `select public.release_review_pair('${expiryTaskId}', '${owner.id}', '${worker.id}')`]);
    expect((await outsider.client.from('reviews').select('id').eq('id', lone.data!.id)).data).toEqual([{ id: lone.data!.id }]);
    execFileSync('docker', ['exec', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `begin; set local session_replication_role = replica; update public.tasks set review_window_started_at = now() - interval '15 days' where id = '${expiryTaskId}'; commit;`]);
    const late = await worker.client.from('reviews').insert({ task_id: expiryTaskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5 });
    expect(late.error).not.toBeNull();
  } finally {
    await workerContext.close();
    await moderatorContext.close();
    await ownerContext.close();
    if (expiryTaskId) expect((await admin.from('tasks').delete().eq('id', expiryTaskId)).error).toBeNull();
    if (taskId) expect((await admin.from('tasks').delete().eq('id', taskId)).error).toBeNull();
    for (const id of ids.reverse()) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test('review reminders, tags and admin anomaly signals', async () => {
  test.setTimeout(90_000);
  test.skip(!api || !anon || !service, 'Requires local Supabase');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const password = `Test-${crypto.randomUUID()}!`;
  const makeUser = async (role: 'tasker' | 'bee' | 'admin') => {
    const email = `remind-${crypto.randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'בדיקה', last_name: 'מקומית' } });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    ids.push(id);
    expect((await admin.from('user_roles').insert({ user_id: id, role })).error).toBeNull();
    const client = createClient(api!, anon!, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    return { id, client };
  };
  const psql = (sql: string) => {
    const project = process.env.SUPABASE_PROJECT_REF;
    if (!project || !/^[a-z0-9]+$/.test(project)) throw new Error('Invalid local project ref');
    return execFileSync('docker', ['exec', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]).toString().trim();
  };
  let taskId: string | undefined;
  try {
    const owner = await makeUser('tasker');
    const worker = await makeUser('bee');
    const moderator = await makeUser('admin');
    const task = await admin.from('tasks').insert({ creator_id: owner.id, name: 'בדיקת תזכורות', short_desc: 'בדיקה מקומית', category: 'housework', payment: 50, workers_needed: 1, publish_state: 'live' }).select('id').single();
    expect(task.error).toBeNull();
    taskId = task.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'live' }).eq('id', taskId)).error).toBeNull();
    const application = await worker.client.from('task_applications').insert({ task_id: taskId, applicant_id: worker.id }).select('id').single();
    expect((await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', application.data!.id)).error).toBeNull();
    expect((await owner.client.rpc('complete_task', { _task_id: taskId })).error).toBeNull();

    // Too early: nothing is due in the first hour.
    expect(psql('select public.send_review_reminders()')).toBe('0');
    psql(`begin; set local session_replication_role = replica; update public.tasks set review_window_started_at = now() - interval '2 hours' where id = '${taskId}'; commit;`);
    expect(psql('select public.send_review_reminders()')).toMatch(/^2$/m);
    expect(psql('select public.send_review_reminders()')).toBe('0');
    // Last-chance reminder at day 12+, once per person.
    psql(`begin; set local session_replication_role = replica; update public.tasks set review_window_started_at = now() - interval '13 days' where id = '${taskId}'; commit;`);
    expect(psql('select public.send_review_reminders()')).toMatch(/^2$/m);
    const notices = await admin.from('notifications').select('id').eq('event_type', 'review_reminder').in('user_id', [owner.id, worker.id]);
    expect(notices.data).toHaveLength(4);

    // Once the owner reviewed, only the worker is reminded again.
    expect((await owner.client.from('reviews').insert({ task_id: taskId, reviewer_id: owner.id, reviewee_id: worker.id, rating: 5, tags: ['on_time', 'pleasant'] })).error).toBeNull();
    expect((await owner.client.from('reviews').select('tags').eq('task_id', taskId).single()).data?.tags).toEqual(['on_time', 'pleasant']);
    expect((await worker.client.from('reviews').insert({ task_id: taskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5, tags: ['not_a_tag'] })).error).not.toBeNull();

    // Anomaly list is admin-only.
    expect((await worker.client.rpc('admin_review_anomalies')).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_review_anomalies')).error).toBeNull();
  } finally {
    if (taskId) await admin.from('tasks').delete().eq('id', taskId);
    for (const id of ids.reverse()) await admin.auth.admin.deleteUser(id);
  }
});


test('automatic screening publishes clean reviews, holds risky ones, and admins can take a review down', async () => {
  test.setTimeout(90_000);
  test.skip(!api || !anon || !service, 'Requires local Supabase');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const password = `Test-${crypto.randomUUID()}!`;
  const makeUser = async (role: 'tasker' | 'bee' | 'admin') => {
    const email = `screen-${crypto.randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'בדיקה', last_name: 'מקומית' } });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    ids.push(id);
    expect((await admin.from('user_roles').insert({ user_id: id, role })).error).toBeNull();
    const client = createClient(api!, anon!, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    return { id, client };
  };
  const tasks: string[] = [];
  const completed = async (owner: { id: string; client: ReturnType<typeof createClient> }, worker: { id: string; client: ReturnType<typeof createClient> }, name: string) => {
    const t = await admin.from('tasks').insert({ creator_id: owner.id, name, short_desc: 'בדיקה', category: 'housework', payment: 50, workers_needed: 1, publish_state: 'live' }).select('id').single();
    const taskId = t.data!.id as string;
    tasks.push(taskId);
    await admin.from('tasks').update({ publish_state: 'live' }).eq('id', taskId);
    const app = await worker.client.from('task_applications').insert({ task_id: taskId, applicant_id: worker.id }).select('id').single();
    await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', app.data!.id);
    expect((await owner.client.rpc('complete_task', { _task_id: taskId })).error).toBeNull();
    return taskId;
  };
  try {
    const owner = await makeUser('tasker');
    const worker = await makeUser('bee');
    const moderator = await makeUser('admin');
    const outsider = await makeUser('bee');

    // 1) Clean, text-free reviews on both sides publish by themselves, with no admin.
    const t1 = await completed(owner, worker, 'פרסום אוטומטי');
    expect((await owner.client.from('reviews').insert({ task_id: t1, reviewer_id: owner.id, reviewee_id: worker.id, rating: 5 })).error).toBeNull();
    expect((await outsider.client.from('reviews').select('id').eq('task_id', t1)).data).toEqual([]);
    expect((await worker.client.from('reviews').insert({ task_id: t1, reviewer_id: worker.id, reviewee_id: owner.id, rating: 4 })).error).toBeNull();
    const auto = await admin.from('reviews').select('status, screening, published_at').eq('task_id', t1);
    expect(auto.data?.every((r) => r.status === 'approved' && r.screening === 'clean' && r.published_at)).toBe(true);
    expect((await outsider.client.from('reviews').select('id').eq('task_id', t1)).data).toHaveLength(2);

    // 2) A low rating always waits for a person, and a client cannot choose its own screening result.
    const t2 = await completed(owner, worker, 'דירוג נמוך');
    const low = await owner.client.from('reviews').insert({ task_id: t2, reviewer_id: owner.id, reviewee_id: worker.id, rating: 2, body: 'לא מרוצה', screening: 'clean', status: 'pending' }).select('id').single();
    expect(low.error).toBeNull();
    const lowRow = await admin.from('reviews').select('status, screening').eq('id', low.data!.id).single();
    expect(lowRow.data).toEqual({ status: 'pending', screening: 'manual_low_rating' });
    expect((await owner.client.rpc('system_screen_review', { _review_id: low.data!.id, _verdict: 'clean' })).error).not.toBeNull();
    expect((await admin.rpc('system_screen_review', { _review_id: low.data!.id, _verdict: 'clean' })).error).toBeNull();
    expect((await admin.from('reviews').select('status').eq('id', low.data!.id).single()).data?.status).toBe('pending'); // low ratings never auto-publish

    // 3) A text review waits for the screen: clean text publishes, flagged text goes to the admin queue.
    const t3 = await completed(owner, worker, 'בדיקת תוכן');
    const clean = await worker.client.from('reviews').insert({ task_id: t3, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5, body: 'עבודה נעימה, תודה' }).select('id').single();
    expect((await admin.from('reviews').select('status, screening').eq('id', clean.data!.id).single()).data).toEqual({ status: 'pending', screening: 'pending_ai' });
    expect((await admin.rpc('system_screen_review', { _review_id: clean.data!.id, _verdict: 'flagged', _reason: 'שפה פוגענית' })).error).toBeNull();
    expect((await admin.from('reviews').select('status, screening, screening_reason').eq('id', clean.data!.id).single()).data).toEqual({ status: 'pending', screening: 'flagged', screening_reason: 'שפה פוגענית' });
    expect((await moderator.client.rpc('admin_moderate_review', { _review_id: clean.data!.id, _status: 'approved' })).error).toBeNull();
    const t4 = await completed(owner, worker, 'תוכן תקין');
    const ok = await worker.client.from('reviews').insert({ task_id: t4, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5, body: 'מקצועי' }).select('id').single();
    expect((await admin.rpc('system_screen_review', { _review_id: ok.data!.id, _verdict: 'clean' })).error).toBeNull();
    expect((await admin.from('reviews').select('status, screening').eq('id', ok.data!.id).single()).data).toEqual({ status: 'approved', screening: 'clean' });
    // Replies are screened the same way.
    const published = await admin.from('reviews').select('id').eq('task_id', t1).eq('reviewee_id', worker.id).single();
    expect((await worker.client.rpc('submit_review_response', { _review_id: published.data!.id, _body: 'תודה רבה' })).error).toBeNull();
    const reply = await admin.from('review_responses').select('id, status, screening').eq('review_id', published.data!.id).single();
    expect(reply.data).toMatchObject({ status: 'pending', screening: 'pending_ai' });
    expect((await admin.rpc('system_screen_review_response', { _response_id: reply.data!.id, _verdict: 'clean' })).error).toBeNull();
    expect((await outsider.client.from('review_responses').select('body').eq('id', reply.data!.id)).data).toEqual([{ body: 'תודה רבה' }]);

    // 4) Takedown of a published review: admin only, reason required, author notified and can appeal, averages follow.
    const before = await outsider.client.from('user_role_ratings').select('review_count').eq('user_id', worker.id).eq('reviewee_role', 'bee').single();
    expect(before.data?.review_count).toBe(1);
    expect((await outsider.client.rpc('admin_remove_review', { _review_id: published.data!.id, _reason: 'x' })).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_remove_review', { _review_id: published.data!.id, _reason: '' })).error).not.toBeNull();
    expect((await moderator.client.rpc('admin_remove_review', { _review_id: published.data!.id, _reason: 'הביקורת מפרה את המדיניות' })).error).toBeNull();
    expect((await moderator.client.rpc('admin_remove_review', { _review_id: published.data!.id, _reason: 'שוב' })).error).not.toBeNull();
    expect((await outsider.client.from('reviews').select('id').eq('id', published.data!.id)).data).toEqual([]);
    expect((await outsider.client.from('user_role_ratings').select('review_count').eq('user_id', worker.id).eq('reviewee_role', 'bee')).data).toEqual([]);
    const notice = await admin.from('notifications').select('data').eq('event_type', 'review_rejected').eq('user_id', owner.id);
    expect(notice.data?.some((n) => (n.data as { removed?: boolean }).removed === true)).toBe(true);
    const removedBy = await admin.from('reviews').select('reviewer_id').eq('id', published.data!.id).single();
    expect(removedBy.data?.reviewer_id).toBe(owner.id);
    expect((await owner.client.from('reviews').select('rejection_reason').eq('id', published.data!.id).single()).data?.rejection_reason).toBe('הביקורת מפרה את המדיניות');
    expect((await owner.client.rpc('appeal_review_decision', { _review_id: published.data!.id, _reason: 'אשמח לבדיקה' })).error).toBeNull();
    expect((await admin.from('admin_audit_log').select('id').eq('action', 'admin_removed_review').eq('target_identifier', published.data!.id)).data).toHaveLength(1);
  } finally {
    for (const id of tasks) await admin.from('tasks').delete().eq('id', id);
    for (const id of ids.reverse()) await admin.auth.admin.deleteUser(id);
  }
});
