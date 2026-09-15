# Chrome Web Store Permission Justifications

## Single Purpose Description

WIT-Calendar automatically imports Wentworth Institute of Technology (WIT) student class schedules into calendar applications. The extension fetches enrolled courses from WIT's self-service portal and generates a calendar with customizable class events, supporting both Google Calendar integration and standard ICS format for other calendar apps.

## Permission Justifications

### sidePanel justification

The sidePanel permission displays the extension's user interface as a side panel in the browser. This provides a persistent, non-intrusive workspace where students can view their imported class schedules, customize event details, and manage calendar settings without leaving their current browser tab.

### scripting justification

The scripting permission executes code on WIT's self-service portal (selfservice.wit.edu) to automatically extract the user's enrolled courses and class schedule information. This eliminates the need for students to manually copy course data, making the import process seamless. Scripts run only when the user initiates the import process.

### activeTab justification

The activeTab permission checks whether the user is already on WIT's self-service portal before the extension creates a new tab. This prevents unnecessary duplicate tabs and provides a smoother user experience by reusing existing tabs when appropriate during the schedule import process.

### tabs justification

The tabs permission manages browser tabs during the schedule import and Google Calendar authentication workflows. The extension creates temporary tabs to access WIT's self-service portal, monitors when pages finish loading to ensure data is ready, and automatically closes these tabs after successfully extracting class information to maintain a clean browsing experience.

### storage justification

The storage permission saves user preferences and authentication tokens locally. This includes: JWT tokens for backend API access, Google Calendar OAuth status, user preferences (time format, event colors, custom templates), and cached schedule data. Storage enables the extension to maintain user settings between sessions without requiring repeated authentication or reconfiguration.

### webNavigation justification

The webNavigation permission monitors browser navigation to detect when Google Calendar OAuth authentication completes successfully. When the backend's OAuth success page loads, the extension automatically closes the authentication popup window and notifies the main extension interface to proceed with calendar integration, creating a seamless authentication experience.

### identity justification

The identity permission accesses the user's Chrome profile information to auto-detect their Google account email address. This streamlines the Google Calendar integration setup by pre-filling the email field, reducing manual entry and potential typos when connecting to Google Calendar.

### identity.email justification

The identity.email permission specifically allows reading the user's email address from their Chrome profile. This is used exclusively to pre-populate the Google Calendar email field during setup, making it faster and easier for students to connect their Google Calendar without manually typing their email address.

### Host permission justification

Host permissions are required for three specific domains:

1. selfservice.wit.edu - WIT's student portal where class schedules are retrieved. The extension fetches enrolled courses and student information from this authenticated portal.

2. *.witcc.dev - The extension's backend API servers (production and staging environments) that process schedule data, manage authentication, generate calendar events, and handle Google Calendar OAuth.

3. heron-selected-literally.ngrok-free.app - Development backend server used for testing new features before production deployment.

These host permissions enable the core functionality of extracting WIT schedules and communicating with the backend to generate calendar integrations.
