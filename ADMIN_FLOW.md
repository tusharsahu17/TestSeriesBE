# Admin Flow for Creating Test Series

The system follows a fixed order because some data depends on other data.

## 1. Create Category and Subject first

* Create a **Category** → Example: `Engineering`
* Create a **Subject** → Example: `Physics`, `Mathematics`
* These are the basic building blocks.

## 2. Create Exam (Optional)

* Create an **Exam** → Example: `JEE Mains`
* If required, connect subjects with the exam:
  * JEE Mains → Physics
  * JEE Mains → Mathematics

## 3. Create Test

* Create a test under a subject.
* Example:
  * Subject: Physics
  * Test: `Physics Mock Test 1`

## 4. Add Questions

* After creating the test, you get a `test_id`.
* Use this `test_id` to add questions.
* Each question can have multiple options.

## 5. Create Test Series

* Create a Test Series under a Category.
* Example:
  * Category: Engineering
  * Series: `JEE Mains Premium Test Series`

## 6. Add Tests to the Series

* Finally, select the tests and add them to the Test Series.
* You can also define the **order** in which the tests should appear.

---

## Simple Flow

```text
Category
   │
   └── Test Series
          │
          └── Tests
                 │
                 └── Questions
                        │
                        └── Options

Subject
   │
   └── Tests

Exam (Optional)
   │
   └── Subjects
```

## In One Line

**Category + Subject → Exam (optional) → Test → Questions → Test Series → Add Tests to Series**

> **Important:** The important point is to **create the parent data first, then the data that depends on it.**
> 
> For example: You cannot create a **Test** without a **Subject**, and you cannot create a **Test Series** without a **Category**, because these IDs are required by the database.
