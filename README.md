# DRP Manager

Course manager for the **Diploma in Radiological Physics (DRP)**, Division of Radiation Physics, Regional Cancer Centre, Thiruvananthapuram.

This repository contains the DRP Manager web application, published with GitHub Pages. It holds no student data and no credentials; all data is stored and served by the DRP Manager server, whose code is kept in a private repository.

## Features
* **Dashboard**: class days and teaching hours for the batch, hours per month and per paper, syllabus coverage, attendance, recent classes
* **Class log**: up to five sessions a day with times, syllabus topic and faculty / activity (Seminar, Paper Presentation, Online Learning, Exam)
* **Attendance**: monthly P / A / L grid with monthly and overall percentages
* **Syllabus**: papers, topics and sub-topics with hours taught, sessions, last taught and faculty, plus search
* **Exams**, **Class tests** and **Assignments** (1–5 star ratings)
* **Calendar**: the academic calendar with class days, RCC holidays and exam/test/assignment dates
* **Reports**: printable monthly report, student report card and the monthly-report "sent" log
* **Faculty** (admin): lecture days and hours per faculty member and activity
* **Settings**: users, students, faculty, papers, topics, holidays, application settings and the read-only import from the old *DRP Manager* sheet
* **Help**: user manual, inside the application

Students see the shared DRP1 class data, and only their own attendance, marks and report card.

## Configuration
The server address is set in [`js/config.js`](js/config.js). It does not change between releases.

## Deployment
Every push to `main` publishes the site automatically through GitHub Actions (`.github/workflows/pages.yml`).
