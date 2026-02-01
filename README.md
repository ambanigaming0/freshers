# 1. Clone the repository
git clone https://github.com/ashish-k-gupta/event-pass-system.git

# 2. Navigate to project directory
cd event-pass-system

# 3. Install dependencies
npm install

# 4. Set up environment variables
cp .env.example .env

# 5. Edit .env file with your configurations
# Open .env and update the values

# 6. Start MongoDB service (in a new terminal)
sudo systemctl start mongod  # Linux/Mac
# OR
net start MongoDB  # Windows

# 7. Run the application
npm run dev

# 8. Open browser and visit
# http://localhost:3000
