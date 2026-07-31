const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/tasks — list all tasks for the current user
router.get('/', (req, res) => {
  const tasks = db.prepare(`
    SELECT * FROM recruitment_tasks
    WHERE created_by = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(req.user.id);
  res.json({ tasks });
});

// POST /api/tasks — create a task
router.post('/', (req, res) => {
  const { title, due_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });

  // place new task at the end
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM recruitment_tasks WHERE created_by = ?'
  ).get(req.user.id);
  const sort_order = (maxRow?.m ?? 0) + 1;

  const result = db.prepare(`
    INSERT INTO recruitment_tasks (title, due_date, completed, sort_order, created_by)
    VALUES (?, ?, 0, ?, ?)
  `).run(title.trim(), due_date || null, sort_order, req.user.id);

  const task = db.prepare('SELECT * FROM recruitment_tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task });
});

// PATCH /api/tasks/:id — update title, due_date, completed, or sort_order
router.patch('/:id', (req, res) => {
  const { title, due_date, completed, sort_order } = req.body;
  const task = db.prepare(
    'SELECT * FROM recruitment_tasks WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const newTitle      = title      !== undefined ? title.trim()         : task.title;
  const newDueDate    = due_date   !== undefined ? (due_date || null)   : task.due_date;
  const newCompleted  = completed  !== undefined ? (completed ? 1 : 0)  : task.completed;
  const newSortOrder  = sort_order !== undefined ? sort_order            : task.sort_order;

  if (!newTitle) return res.status(400).json({ error: 'Title cannot be empty.' });

  db.prepare(`
    UPDATE recruitment_tasks
    SET title = ?, due_date = ?, completed = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND created_by = ?
  `).run(newTitle, newDueDate, newCompleted, newSortOrder, task.id, req.user.id);

  const updated = db.prepare('SELECT * FROM recruitment_tasks WHERE id = ?').get(task.id);
  res.json({ task: updated });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const task = db.prepare(
    'SELECT id FROM recruitment_tasks WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  db.prepare('DELETE FROM recruitment_tasks WHERE id = ?').run(task.id);
  res.json({ success: true });
});

module.exports = router;
