import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Real local Auth, PostgREST, RLS and Realtime. Never seed a remote project.
const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
const enabled = Boolean(api && anon && service);
if (enabled && !['localhost', '127.0.0.1'].includes(new URL(api!).hostname)) {
  throw new Error('Completion E2E must use local Supabase');
}

test('completion closes chat, records earnings and supports mutual ratings', async ({ browser, page }, testInfo) => {
  test.skip(!enabled, 'Run scripts/task-completion-e2e.sh with local Supabase running.');
  test.setTimeout(120_000);
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const password = `E2e-${crypto.randomUUID()}!`;
  const makeUser = async (role: 'bee' | 'tasker') => {
    const email = `completion-${crypto.randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { first_name: role === 'bee' ? 'עובד' : 'מפרסם', last_name: 'בדיקה' } });
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
  const workerPage = await workerContext.newPage();
  let taskId: string | undefined;
  let paymentTaskId: string | undefined;
  try {
    const owner = await makeUser('tasker');
    const worker = await makeUser('bee');
    const outsider = await makeUser('bee');
    const task = await admin.from('tasks').insert({ creator_id: owner.id, name: 'בדיקת השלמת מטלה',
      short_desc: 'משימת E2E מקומית', category: 'housework', payment: 125, payment_type: 'task',
      workers_needed: 1, publish_state: 'live' }).select('id').single();
    expect(task.error).toBeNull();
    taskId = task.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'live' }).eq('id', taskId)).error).toBeNull();
    const application = await worker.client.from('task_applications').insert({ task_id: taskId, applicant_id: worker.id }).select('id').single();
    expect(application.error).toBeNull();
    expect((await owner.client.from('task_applications').update({ status: 'accepted' }).eq('id', application.data!.id)).error).toBeNull();
    const conversation = await owner.client.rpc('ensure_accepted_task_conversation', { _task_id: taskId, _applicant_id: worker.id });
    expect(conversation.error).toBeNull();
    const conversationId = conversation.data;
    expect((await worker.client.rpc('complete_task', { _task_id: taskId })).error).not.toBeNull();
    expect((await worker.client.from('reviews').insert({ task_id: taskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5 })).error).not.toBeNull();

    await login(page, owner.email);
    await login(workerPage, worker.email);
    await workerPage.goto(`/chat?conversation=${conversationId}`);
    const composer = workerPage.locator('textarea');
    await expect(composer).toBeVisible();
    await composer.fill('העבודה הסתיימה');
    await workerPage.getByRole('button', { name: 'שליחת הודעה', exact: true }).click();
    await expect(workerPage.getByText('העבודה הסתיימה', { exact: true }).first()).toBeVisible();

    await page.goto(`/task/${taskId}`);
    await page.getByRole('button', { name: 'ניהול וסיום המטלה' }).click();
    await page.getByRole('button', { name: 'סמן כהושלמה', exact: true }).click();
    await page.getByRole('button', { name: 'סימון כהושלמה', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Dismissing the automatic prompt must not lose the opportunity to rate.
    await page.getByRole('dialog').getByRole('button', { name: 'ביטול', exact: true }).click();
    await expect(page.getByText('הושלמה', { exact: true })).toBeVisible();
    await expect(composer).toHaveCount(0, { timeout: 40_000 });
    expect((await admin.from('tasks').select('status').eq('id', taskId).single()).data?.status).toBe('completed');
    expect((await worker.client.from('messages').insert({ conversation_id: conversationId, sender_id: worker.id, content: 'must fail' })).error).not.toBeNull();
    expect((await outsider.client.from('reviews').insert({ task_id: taskId, reviewer_id: outsider.id, reviewee_id: owner.id, rating: 1 })).error).not.toBeNull();
    expect((await worker.client.from('reviews').insert({ task_id: taskId, reviewer_id: worker.id, reviewee_id: owner.id, rating: 5, status: 'approved' })).error).not.toBeNull();

    await page.goto('/my-tasks?tab=applications');
    await page.getByRole('button', { name: 'דירוג העובד' }).click();
    await page.getByRole('button', { name: '5 כוכבים', exact: true }).click();
    await page.getByRole('button', { name: 'שלח דירוג', exact: true }).click();
    await expect(page.getByRole('button', { name: 'הדירוג נשלח', exact: true })).toBeDisabled();

    await workerPage.goto('/my-tasks?tab=performing');
    await expect(workerPage.getByText('הושלמה', { exact: true })).toBeVisible();
    await expect(workerPage.getByRole('button', { name: 'מעבר לצ׳אט' })).toHaveCount(0);
    await workerPage.getByRole('button', { name: 'דירוג המפרסם' }).click();
    await workerPage.getByRole('button', { name: '4 כוכבים', exact: true }).click();
    await workerPage.getByRole('button', { name: 'שלח דירוג', exact: true }).click();
    await expect(workerPage.getByRole('button', { name: 'הדירוג נשלח', exact: true })).toBeDisabled();
    await workerPage.screenshot({ path: testInfo.outputPath('completed-worker.png'), fullPage: true });
    const reviews = await admin.from('reviews').select('rating,status').eq('task_id', taskId);
    expect(reviews.error).toBeNull();
    expect(reviews.data?.map(r => r.rating).sort()).toEqual([4, 5]);
    expect(reviews.data?.every(r => r.status === 'pending')).toBe(true);

    await workerPage.goto('/profile');
    await expect(workerPage.getByText('הכנסות', { exact: true }).locator('..')).toContainText('125');
    await workerPage.screenshot({ path: testInfo.outputPath('earnings.png'), fullPage: true });
    await expect(workerPage.locator('body')).not.toContainText('נתוני הביצוע וההכנסות לא נטענו');
    expect(await workerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await workerPage.goto(`/chat?conversation=${conversationId}`);
    await expect(workerPage.locator('textarea')).toHaveCount(0);

    const paymentTask = await admin.from('tasks').insert({ creator_id: owner.id, name: 'תשלום בדיקה',
      short_desc: 'בדיקת כפתור תשלום חד-פעמי', category: 'housework', payment: 50 }).select('id').single();
    expect(paymentTask.error).toBeNull();
    paymentTaskId = paymentTask.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'pending_payment', payment_due: 8 }).eq('id', paymentTaskId)).error).toBeNull();
    // The provider is covered by wallet.e2e.test.ts. Here verify UI action and error recovery.
    await page.route('**/functions/v1/task-pay', async route => {
      expect(route.request().postDataJSON()).toEqual({ action: 'wallet', task_id: paymentTaskId });
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'payment_unavailable' }) });
    });
    await page.goto('/my-tasks?tab=published');
    await expect(page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('payment-options.png'), fullPage: true });
    await page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true }).click();
    await expect(page.getByText('משהו השתבש, נסו שוב בעוד רגע', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await workerContext.close();
    if (paymentTaskId) expect((await admin.from('tasks').delete().eq('id', paymentTaskId)).error).toBeNull();
    if (taskId) expect((await admin.from('tasks').delete().eq('id', taskId)).error).toBeNull();
    for (const id of ids.reverse()) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
