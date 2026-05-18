# SafeSight User Manual

## 1. Introduction

### 1.1 Application Overview
SafeSight is a multi-platform collision detection and response system intended for CCTV-supported road monitoring. It addresses the limitations of manual reporting by providing real-time detection, short evidence clip recording, and coordinated response workflows. The system enables reviewers to classify incident severity and collision type, and allows administrators to monitor collision trends and camera health.

SafeSight consists of a FastAPI-based backend, a web administrative dashboard for captains and staff, and a mobile responder application for field personnel. It integrates with MongoDB for data storage and supports optional SMS delivery via a third-party gateway.

### 1.2 Authorized Use Permission
Unauthorized reproduction, distribution, or use of the SafeSight system, its documentation, or its source code without explicit permission is prohibited. Violations may result in civil and or criminal liability under applicable laws and institutional policies.

### 1.3 System Requirements
To ensure stable and optimal performance, the following requirements should be met.

#### 1.3.1 Backend (Server)
- Operating system: Windows 10/11, Linux, or macOS.
- Python: 3.11 or later.
- Database: MongoDB 5.0 or later (local or remote).
- Dependencies: install from backend/requirements.txt.
- Optional: OpenCV for video capture (opencv-python-headless is used).
- Network: stable LAN or WAN access to CCTV RTSP streams.

#### 1.3.2 Web Dashboard (Frontend)
- Operating system: Windows, macOS, or Linux.
- Node.js: 18 or later (development and build).
- Browser: latest Chrome, Edge, or Firefox.

#### 1.3.3 Mobile Responder Application
- Android: 8.0 or later (Android 26+).
- iOS: 13 or later.
- Network: Internet access to reach the backend API.

#### 1.3.4 SMS Integration (Optional)
- Active SMS provider account (configured via backend/.env).
- Outbound HTTPS access from the backend server.

#### 1.3.5 Recommended Hardware (Guidance)
- Small deployment (1-4 cameras, low traffic): 4-core CPU, 8-16 GB RAM, SSD storage.
- Medium deployment (5-12 cameras, regular alerts): 6-8 core CPU, 16-32 GB RAM, SSD storage.
- Large deployment (13+ cameras, heavy traffic): 8+ core CPU, 32+ GB RAM, SSD storage.
- GPU (optional for faster inference):
  - Small: NVIDIA GTX 1650 / RTX 3050 (4-8 GB VRAM).
  - Medium: NVIDIA RTX 3060 (12 GB VRAM).
  - Large: NVIDIA RTX 3080 / RTX 4070+ (10-16 GB VRAM).
- Network: wired LAN for cameras and backend where possible.
- Storage: allocate additional capacity for clips; GridFS grows with recorded video volume.

#### 1.3.6 App Permissions (Mobile)
The mobile responder application primarily requires network access to communicate with the backend API and open evidence clips. Depending on the device and operating system, the user may be asked for storage access when downloading or caching clips. No camera or location permission is required for standard operation.

### 1.4 Organizational Manual
This manual is organized to support both operational users and administrative users. Section 2 details the web application procedures, Section 3 describes mobile responder procedures, and Sections 4 to 5 provide documentation support and operational notes.

#### General Information
SafeSight provides real-time collision detection, evidence capture, responder alerts, and trend reporting. It includes role-based access for captains and responders, a web dashboard for management and analytics, and a mobile application for field response.

#### Getting Started
- Confirm that the backend server and database are running.
- Log in to the web dashboard using authorized credentials.
- Verify that cameras are active and streams are reachable.
- Monitor the dashboard for detected incidents.
- Review collision logs and update status as response progresses.

#### Getting Started (Captain - Web Application)
1. Open a supported web browser (Chrome, Edge, or Firefox).
2. Navigate to the SafeSight Admin URL provided by the system administrator.
3. Enter the captain account credentials and select Sign In.
4. Verify access to the Dashboard and navigation menu.

## 2. Web Application Procedures

### 2.1 Login
**Purpose:** Authenticate and grant access to the system.
**Procedure:**
1. Enter the assigned username and password.
2. Select Sign In.
3. Confirm that the Dashboard page loads.

**Required screenshots:**
- Login screen with username and password fields and the Sign In button.

---

### 2.2 Dashboard
**Purpose:** Provide a consolidated overview of incidents, alerts, and camera status.
**Procedure:**
1. Review summary cards for total collisions, pending incidents, and camera counts.
2. Review recent collisions and alerts in the lists.
3. Use quick links to navigate to Collision Logs, Alerts, and Analytics.

**Required screenshots:**
- Dashboard with summary statistics and recent collisions list.

---

### 2.3 Camera Dashboard
**Purpose:** Provide live CCTV viewing and stream status.
**Procedure:**
1. View live feeds from all active cameras.
2. Use fullscreen controls to focus on a specific camera.
3. Observe stream health indicators and reconnect if a stream fails.

**Required screenshots:**
- Camera grid view with at least two live feeds.

---

### 2.4 Camera Locations
**Purpose:** Display map pinpoints for CCTV cameras.
**Procedure:**
1. Open the map view.
2. Verify that each camera is represented by a pin.

**Required screenshots:**
- Map view with multiple camera pins visible.

---

### 2.5 Camera Management
**Purpose:** Add, edit, and manage camera configurations.
**Procedure:**
1. Select Add Camera to register a new CCTV source.
2. Enter camera name, location, and RTSP URL.
3. Provide map coordinates if available.
4. Save changes and confirm the camera status is Active.

**Required screenshots:**
- Camera list with the Add Camera button and at least one camera entry.

---

### 2.6 Collision Logs
**Purpose:** Review collision incidents, clips, severity, and collision type.
**Procedure:**
1. Filter by status (pending, acknowledged, responded, resolved).
2. Select Play 15s Clip to review the incident.
3. After reviewing, set Severity (low, medium, high).
4. Set Collision Type (single-vehicle, rear-end, head-on, side-impact).
5. Update the incident status as the response progresses.
6. Use Export to download CSV logs if required.

**Required screenshots:**
- Collision logs table showing Severity and Type columns.
- Clip viewer modal showing severity and collision type controls.

---

### 2.7 Alerts
**Purpose:** Review SMS delivery history and status.
**Procedure:**
1. Review alert entries for sent and failed messages.
2. Inspect timestamps and delivery status indicators.

**Required screenshots:**
- Alerts list with status badges and timestamps.

---

### 2.8 Analytics
**Purpose:** Monitor collision trends, classifications, and hotspots.
**Procedure:**
1. Review daily incident trends for the current month.
2. Review severity distribution and collision type breakdown.
3. Inspect top camera hotspots.
4. Review incident status counts.

**Required screenshots:**
- Analytics page showing the daily trend chart and collision type breakdown.

---

### 2.9 User Management (Captain Only)
**Purpose:** Manage user accounts and permissions.
**Procedure:**
1. Add new users with role assignment (Captain or Responder).
2. Update user details or deactivate users if required.
3. Remove users if necessary.

**Required screenshots:**
- User list with roles and action buttons.

---

## 3. Mobile Responder Application Procedures

### 3.1 Login
**Purpose:** Authenticate responders on mobile.
**Procedure:**
1. Enter the assigned username and password.
2. Select Sign In.

**Required screenshots:**
- Mobile login screen.

---

### 3.2 Dashboard
**Purpose:** Provide quick operational statistics for responders.
**Procedure:**
1. Review key metrics (collisions, pending cases, alerts).
2. Navigate to Collisions or Alerts as required.

**Required screenshots:**
- Mobile dashboard with statistics cards.

---

### 3.3 Collision Logs (Mobile)
**Purpose:** Review collisions and update status on the go.
**Procedure:**
1. Select a status filter at the top of the list.
2. Select View 15s Clip to open the clip in the device browser.
3. After reviewing, set Severity and Collision Type.
4. Update status (acknowledged, responded, resolved).

**Required screenshots:**
- Collision card with severity, collision type, and action buttons visible.

---

### 3.4 Alerts (Mobile)
**Purpose:** Review SMS alert history.
**Procedure:**
1. Review the alert list and delivery status.

**Required screenshots:**
- Alerts list screen on mobile.

---

## 4. Screenshot Checklist (Documentation)
- Web login page.
- Web dashboard summary.
- Camera dashboard live view.
- Camera locations map.
- Camera management list.
- Collision logs table with Severity and Type columns.
- Collision clip viewer modal.
- Alerts list (web).
- Analytics charts (include collision type breakdown).
- User management list.
- Mobile login.
- Mobile dashboard.
- Mobile collisions card with severity and collision type.
- Mobile alerts list.

## 5. Operational Notes
- A clip must be reviewed before severity or collision type can be set.
- Clip status may indicate processing while the 15-second evidence is generated.
- Collision type values are reviewer-assigned classifications.
