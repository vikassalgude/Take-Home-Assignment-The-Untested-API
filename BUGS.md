# Bug Report — The Untested API

This document details all bugs discovered during automated unit and route integration testing of the Task API. Bugs are ordered by severity (High to Low).

---

## BUG-1: Pagination Off-By-One Offset Calculation Skips Page 1 Items

- **Severity:** High
- **Endpoint / Function:** `GET /tasks?page=1&limit=10` / `taskService.getPaginated(page, limit)`
- **Status:** FIXED (in Phase 4)
- **Expected Behavior:** Requesting page 1 with 1-based indexing (`page=1`) should compute `offset = 0` (`(page - 1) * limit`) and return the first page of results starting from index 0.
- **Actual Behavior:** The service calculates `const offset = page * limit;`. For `page=1` and `limit=10`, `offset` is calculated as `10`, skipping items 0 through 9 entirely and returning the second page instead.
- **How Discovered:** Discovered via unit test `BUG-1: getPaginated(1, 10) should return first page (offset 0), not skip first 10 items` in `tests/taskService.test.js`, route integration test in `tests/tasks.routes.test.js`, and manual curl verification in Phase 1 baseline.
- **Root Cause:** 
  - File: `task-api/src/services/taskService.js`, Line 12.
  - Reason: The mathematical offset calculation does not subtract 1 from the 1-based `page` parameter before multiplying by `limit`.
- **Suggested Fix:**
  Change line 12 in `task-api/src/services/taskService.js` to:
  ```javascript
  const offset = Math.max(0, (page - 1) * limit);
  ```

---

## BUG-2: Status Filtering Uses Substring Matching Instead of Exact Enum Match

- **Severity:** High
- **Endpoint / Function:** `GET /tasks?status=...` / `taskService.getByStatus(status)`
- **Status:** Documented (Unfixed)
- **Expected Behavior:** `GET /tasks?status=todo` should return only tasks whose `status` strictly equals `'todo'`. An invalid status parameter like `?status=do` should return an empty array `[]` (or a validation error).
- **Actual Behavior:** `getByStatus` executes `tasks.filter((t) => t.status.includes(status))`. Because it uses JavaScript `.includes()`, passing `?status=do` matches both `'todo'` and `'done'`. Passing `?status=in` matches `'in_progress'`.
- **How Discovered:** Discovered via unit test `BUG-2: getByStatus should not perform substring matching...` in `tests/taskService.test.js` and route test in `tests/tasks.routes.test.js`.
- **Root Cause:** 
  - File: `task-api/src/services/taskService.js`, Line 9.
  - Reason: Using String `.includes()` instead of strict equality `===` causes unintended partial substring matches.
- **Suggested Fix:**
  Change line 9 in `task-api/src/services/taskService.js` to:
  ```javascript
  const getByStatus = (status) => tasks.filter((t) => t.status === status);
  ```

---

## BUG-3: Completing Task Unintentionally Resets Priority to `'medium'`

- **Severity:** Medium
- **Endpoint / Function:** `PATCH /tasks/:id/complete` / `taskService.completeTask(id)`
- **Status:** Documented (Unfixed)
- **Expected Behavior:** Completing a task should change `status` to `'done'` and populate `completedAt` timestamp without altering existing task properties like `priority`.
- **Actual Behavior:** Completing a task with `priority: 'high'` or `priority: 'low'` automatically resets its `priority` to `'medium'`.
- **How Discovered:** Discovered via unit test `BUG-3: completeTask should preserve existing task priority...` in `tests/taskService.test.js` and route test in `tests/tasks.routes.test.js`.
- **Root Cause:** 
  - File: `task-api/src/services/taskService.js`, Line 69.
  - Reason: The object literal returned by `completeTask` explicitly hardcodes `priority: 'medium'`.
- **Suggested Fix:**
  Remove `priority: 'medium',` from line 69 of `task-api/src/services/taskService.js`.

---

## BUG-4: In-Memory Data Store Leaks Object References Allowing Unsafe External Mutations

- **Severity:** Medium
- **Endpoint / Function:** `taskService.getAll()`, `taskService.findById()`, `taskService.getPaginated()`
- **Status:** Documented (Unfixed)
- **Expected Behavior:** Service methods should return copies of task objects so callers cannot accidentally mutate internal store state without invoking `update()`.
- **Actual Behavior:** `findById()` returns a direct reference to the object inside the `tasks` array. Modifying properties on returned objects mutates the task in memory directly.
- **How Discovered:** Discovered via unit test `BUG-4: findById should return object copy...` in `tests/taskService.test.js`.
- **Root Cause:** 
  - File: `task-api/src/services/taskService.js`, Lines 5, 7, 13.
  - Reason: Direct reference assignment without cloning (`{ ...task }`).
- **Suggested Fix:**
  Return shallow object clones for task objects retrieved from service methods:
  ```javascript
  const findById = (id) => {
    const task = tasks.find((t) => t.id === id);
    return task ? { ...task } : undefined;
  };
  ```

---

## BUG-5: Documentation Mismatch for Status Enum Values in README.md

- **Severity:** Low
- **Endpoint / Function:** API Contract & Documentation
- **Status:** Documented (Unfixed)
- **Expected Behavior:** `README.md` documentation should accurately list the status enum values accepted by the API validators (`todo | in_progress | done`).
- **Actual Behavior:** `README.md` specifies `pending | in-progress | completed`. API clients sending `pending` receive a `400 Bad Request` validation error.
- **How Discovered:** Discovered during initial code analysis (Step 0) comparing `README.md` against `src/utils/validators.js`.
- **Root Cause:** 
  - File: `README.md`, Line 77.
  - Reason: Outdated documentation in `README.md`.
- **Suggested Fix:**
  Update line 77 of `README.md` to `"status": "todo | in_progress | done"`.
