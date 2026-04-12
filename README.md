# NeuroGuide_TP19

# Team GitHub Workflow & Code Quality Guidelines

This document defines how our team will work using GitHub for the project.  
Please follow this strictly to avoid conflicts, rework, and ensure high code quality.

##  1. Clone the Repository
Before starting any work, you must clone the project repository to your local machine.

Steps:
1. Go to the GitHub repository link
2. Click **Code → HTTPS**
3. Copy the URL
4. Open terminal and run:

git clone <repository-url>
cd <repository-folder>

## 2. Always Create a New Branch (DO NOT work on main)

Each user story must be developed in a **separate branch**.

Naming Convention:
git checkout -b feature/<user-story-name>

Example:
git checkout -b feature/job-simplification

## 3. Development Workflow (MANDATORY)

Follow this order strictly:

### Step 1: Pull latest code
git pull origin main

### Step 2: Work on your feature branch
Make your changes locally.

### Step 3: Before Committing / Pushing (VERY IMPORTANT)
Make sure your branch is aligned with main
Before committing or pushing, always:
git pull origin main

### Step 4: Add and commit changes
```bash
git add .
git commit -m "Implemented: <feature description>"
```
### Step 5: Before pushing → SHOW YOUR WORK TO RILES

* Get a quick review
* Fix issues if needed

### Step 6: Inform your teammates
Before creating a Pull Request, notify the team through the designated communication channel.

## 4. Push Code
```bash
git push origin feature/<branch-name>
```

## 5. Create Pull Request (PR)
After pushing:
1. Go to GitHub
2. Click **Compare & Pull Request**
3. Add:
   * Title: Feature name
   * Description: What you implemented
4. Assign reviewer (All team members)

## 6. Merge Rules
* Do NOT merge your own PR
* Only merge after approval
* Ensure no conflicts or errors
----------------------------------------------------------------------------------------------------
# Code Quality Guidelines

## 1. Follow Project Structure
* Keep files organised (components, services, utils)
* Do not dump everything in one file

## 2. Write Clean & Readable Code
## 3. Small Commits (IMPORTANT)

Don’t do:
> “Final changes”

Do:
> “Added job simplification API integration”
> “Fixed input validation bug”

## 4. One Feature = One Branch
* Do NOT mix multiple user stories in one branch

## 5. Test Before Pushing
Before pushing:
* Check UI works
* No console errors
* Feature matches acceptance criteria

## 6. Match Acceptance Criteria
Every feature must:
* Follow user story
* Satisfy acceptance criteria
* Be testable

## 7. No Direct Changes to Main

## 8. Communicate Frequently
* Before pushing → inform team
* If stuck → ask early
* If changing something major → discuss first

