const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Task API Route Integration Tests', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('GET /tasks/stats', () => {
    it('returns stats object with counts and overdue total', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      taskService.create({ title: 'Task 1', status: 'todo', dueDate: pastDate });
      taskService.create({ title: 'Task 2', status: 'in_progress' });
      taskService.create({ title: 'Task 3', status: 'done' });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        todo: 1,
        in_progress: 1,
        done: 1,
        overdue: 1,
      });
    });

    it('returns zero counts when no tasks exist', async () => {
      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        todo: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      });
    });
  });

  describe('GET /tasks', () => {
    it('returns all tasks when no query params are provided', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('filters tasks by valid status parameter', async () => {
      taskService.create({ title: 'Todo', status: 'todo' });
      taskService.create({ title: 'Done', status: 'done' });

      const res = await request(app).get('/tasks?status=todo');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Todo');
    });

    it('returns empty array when status filter matches no tasks', async () => {
      taskService.create({ title: 'Todo', status: 'todo' });

      const res = await request(app).get('/tasks?status=in_progress');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it.failing('BUG-2: GET /tasks?status=do should not return todo/done tasks via substring match', async () => {
      taskService.create({ title: 'Todo', status: 'todo' });
      taskService.create({ title: 'Done', status: 'done' });

      const res = await request(app).get('/tasks?status=do');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('BUG-1 [FIXED]: GET /tasks?page=1&limit=2 should return first 2 items of page 1', async () => {
      taskService.create({ title: 'T1' });
      taskService.create({ title: 'T2' });
      taskService.create({ title: 'T3' });

      const res = await request(app).get('/tasks?page=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].title).toBe('T1');
      expect(res.body[1].title).toBe('T2');
    });

    it('handles pagination beyond available items', async () => {
      taskService.create({ title: 'T1' });

      const res = await request(app).get('/tasks?page=10&limit=5');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('falls back gracefully to default pagination values when page/limit are non-numeric', async () => {
      taskService.create({ title: 'T1' });

      const res = await request(app).get('/tasks?page=invalid&limit=abc');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /tasks', () => {
    it('creates a task with valid minimal payload (201 Created)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'New Task' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('New Task');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('medium');
    });

    it('creates a task with valid complete payload', async () => {
      const dueDate = new Date().toISOString();
      const res = await request(app)
        .post('/tasks')
        .send({
          title: 'Full Task',
          description: 'Detailed description',
          status: 'in_progress',
          priority: 'high',
          dueDate,
        });

      expect(res.status).toBe(201);
      expect(res.body.description).toBe('Detailed description');
      expect(res.body.status).toBe('in_progress');
      expect(res.body.priority).toBe('high');
      expect(res.body.dueDate).toBe(dueDate);
    });

    it('rejects creation when title is missing (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ priority: 'high' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects creation when title is empty string or whitespace (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('rejects creation when title is not a string (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('rejects creation when status is invalid enum (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Valid Title', status: 'pending' }); // 'pending' is invalid; valid: todo|in_progress|done

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status/i);
    });

    it('rejects creation when priority is invalid enum (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Valid Title', priority: 'urgent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority/i);
    });

    it('rejects creation when dueDate is an invalid date string (400)', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Valid Title', dueDate: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate/i);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('updates task with valid payload (200 OK)', async () => {
      const created = taskService.create({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ title: 'Updated', priority: 'high' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.priority).toBe('high');
    });

    it('returns 404 when updating non-existent task ID', async () => {
      const res = await request(app)
        .put('/tasks/00000000-0000-0000-0000-000000000000')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Task not found' });
    });

    it('returns 400 when title is empty string', async () => {
      const created = taskService.create({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('returns 400 when status is invalid enum value', async () => {
      const created = taskService.create({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status/i);
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    it('marks task as completed (200 OK)', async () => {
      const created = taskService.create({ title: 'Incomplete' });

      const res = await request(app)
        .patch(`/tasks/${created.id}/complete`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).not.toBeNull();
    });

    it('returns 404 when completing non-existent task ID', async () => {
      const res = await request(app)
        .patch('/tasks/non-existent-id/complete');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Task not found' });
    });

    it.failing('BUG-3: PATCH /tasks/:id/complete should preserve task priority', async () => {
      const created = taskService.create({ title: 'High priority task', priority: 'high' });

      const res = await request(app)
        .patch(`/tasks/${created.id}/complete`);

      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('high');
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes existing task (204 No Content)', async () => {
      const created = taskService.create({ title: 'To delete' });

      const res = await request(app).delete(`/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');

      // Verify task is gone
      const checkRes = await request(app).get('/tasks');
      expect(checkRes.body).toEqual([]);
    });

    it('returns 404 when deleting non-existent task ID or deleting twice', async () => {
      const created = taskService.create({ title: 'Delete once' });

      const res1 = await request(app).delete(`/tasks/${created.id}`);
      expect(res1.status).toBe(204);

      const res2 = await request(app).delete(`/tasks/${created.id}`);
      expect(res2.status).toBe(404);
      expect(res2.body).toEqual({ error: 'Task not found' });
    });
  });
});
