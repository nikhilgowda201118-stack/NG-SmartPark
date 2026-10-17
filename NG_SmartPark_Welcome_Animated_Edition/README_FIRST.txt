NG SMARTPARK — WELCOME EDITION (PREMIUM ANIMATED WEBSITE)
========================================

PROJECT BRAND
- Product name: NG SmartPark
- Designed and developed by: Nithin Gowda
- Academic context: First-Year Computer Science Engineering mini project
- Tagline: A little code, a smarter city, a smoother everyday.

WHAT MAKES THIS VERSION DISTINCTIVE
- Custom NG monogram logo (SVG) and PNG export for use in project reports
- Welcome-focused introduction: “Welcome to NG SmartPark” plus a second creator heading: “Built by Nithin Gowda. Made for smarter parking.”
- Personalised branding with Nithin Gowda's name
- Dark neon interface with electric cyan, violet, mint and gold accents
- Animated hero scene, glowing parking cards and micro-interactions
- Showcase Mode button that intensifies the glow and slot animations for demos
- Live dashboard metrics, including today's vehicle arrivals
- Automatic parking-slot assignment and duplicate-active-vehicle checks
- Checkout fee calculation and saved parking history
- SQLite database persistence and responsive design

RUN ON WINDOWS 11 (NO EXTRA PACKAGES REQUIRED)
1. Extract this ZIP into a new folder, such as Downloads\NG_SmartPark_Premium.
2. Open the extracted folder.
3. Double-click RUN_WEBSITE.bat, or open Command Prompt in this folder and run:
       py app.py
4. Open http://127.0.0.1:8000 if the browser does not open automatically.
5. Keep the black command window open while demonstrating the application.
6. Stop the server with Ctrl+C in the command window.

DEMO FLOW
1. Enter DEMO123, choose Car, and click Park Vehicle.
2. Show the occupied slot and the updated dashboard counters.
3. Enter DEMO123 in Check-out Number and calculate its fee.
4. Show the completed transaction in Parking History.
5. Click SHOWCASE MODE to demonstrate the intensified animated visual theme.

DEFAULT SETTINGS
- 10 virtual slots
- ₹20 per started hour; minimum fee ₹20
- Local database: smart_parking_web.db
- Local address: http://127.0.0.1:8000

LOGO FILES
- static/ng-logo.svg — vector mark used by the website
- static/ng-smartpark-logo.png — high-resolution PNG export

TECHNOLOGIES
Python standard-library HTTP server + SQLite + HTML + CSS + JavaScript.
No extra Python packages are required to run the website.

NOTE
This is a local software simulation. Physical sensors, cameras, online payments and user accounts are future enhancements, not current features.


LIVE PARKING MOVEMENT ANIMATION
-------------------------------
- The illustrated lot now displays one bay for each real parking slot.
- When you register a vehicle, the car animates from the entry gate to its assigned bay.
- When you check out a vehicle, it animates from its bay to the exit gate.
- Green sensor lights mean the slot is available; red lights mean it is occupied.
- Use the "Play movement demo" button to show one sample car arriving and leaving without creating a fake database record.
- This is a software simulation. It does not operate physical gates or read real IoT sensors.
