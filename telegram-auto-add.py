cat > smart_github_runner.py << 'EOF'
#!/usr/bin/env python3
"""
Smart GitHub Runner - Auto update and run
"""

import os
import sys
import requests
import hashlib
import subprocess
from pathlib import Path

class GitHubAutoUpdater:
    def __init__(self):
        self.repo_owner = "username"  # Ganti dengan username GitHub Anda
        self.repo_name = "telegram-auto-add"  # Ganti dengan nama repo
        self.script_name = "final_auto_add.py"
        self.data_file = "anggota_telegram.json"
        self.local_dir = Path.home() / "telegram_github"
        self.github_raw = f"https://raw.githubusercontent.com/{self.repo_owner}/{self.repo_name}/main"
        
        # Buat direktori
        self.local_dir.mkdir(exist_ok=True)
        
    def get_local_hash(self, filepath):
        """Get MD5 hash of local file"""
        if not filepath.exists():
            return None
        with open(filepath, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    
    def get_remote_hash(self, filename):
        """Get MD5 hash of remote file"""
        url = f"{self.github_raw}/{filename}"
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                return hashlib.md5(response.content).hexdigest()
        except:
            pass
        return None
    
    def download_file(self, filename):
        """Download file from GitHub"""
        url = f"{self.github_raw}/{filename}"
        local_path = self.local_dir / filename
        
        print(f"📥 Downloading {filename}...")
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                # Backup old file
                if local_path.exists():
                    backup = local_path.with_suffix('.backup')
                    local_path.rename(backup)
                    print(f"   💾 Backup: {backup.name}")
                
                # Save new file
                with open(local_path, 'wb') as f:
                    f.write(response.content)
                
                # Make executable if python script
                if filename.endswith('.py'):
                    os.chmod(local_path, 0o755)
                
                print(f"   ✅ Updated: {filename}")
                return True
            else:
                print(f"   ❌ Failed: HTTP {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False
    
    def check_and_update(self):
        """Check for updates and update if needed"""
        print("🔍 Checking for updates...")
        
        files_to_check = [
            self.script_name,
            "requirements.txt",
            "config.py"
        ]
        
        updated = False
        for filename in files_to_check:
            local_hash = self.get_local_hash(self.local_dir / filename)
            remote_hash = self.get_remote_hash(filename)
            
            if remote_hash and local_hash != remote_hash:
                print(f"   ⚡ Update available for {filename}")
                if self.download_file(filename):
                    updated = True
        
        if not updated:
            print("   ✅ Already up to date")
        
        return updated
    
    def ensure_data_file(self):
        """Ensure data file exists"""
        data_path = self.local_dir / self.data_file
        if data_path.exists():
            print(f"✅ Data file found: {self.data_file}")
            return True
        
        # Cek di lokasi lama
        old_locations = [
            Path.home() / "telegram_project" / self.data_file,
            Path.home() / "anggota_telegram.json",
            Path.cwd() / self.data_file
        ]
        
        for old_loc in old_locations:
            if old_loc.exists():
                import shutil
                shutil.copy2(old_loc, data_path)
                print(f"📋 Copied data from: {old_loc}")
                return True
        
        print(f"⚠️  Data file not found: {self.data_file}")
        print(f"   Please copy {self.data_file} to: {data_path}")
        return False
    
    def install_requirements(self):
        """Install Python requirements"""
        req_file = self.local_dir / "requirements.txt"
        if req_file.exists():
            print("📦 Installing requirements...")
            try:
                subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(req_file)], 
                             check=True)
                print("✅ Requirements installed")
            except subprocess.CalledProcessError:
                print("⚠️  Failed to install requirements")
        else:
            # Install telethon jika belum ada
            try:
                import telethon
                print("✅ telethon already installed")
            except ImportError:
                print("📦 Installing telethon...")
                subprocess.run([sys.executable, "-m", "pip", "install", "telethon"], 
                             check=True)
    
    def run(self):
        """Main run method"""
        print("="*50)
        print("🚀 GITHUB TELEGRAM AUTO-ADD")
        print("="*50)
        
        # Update dari GitHub
        try:
            self.check_and_update()
        except:
            print("⚠️  Could not check updates, using local version")
        
        # Pastikan ada data file
        if not self.ensure_data_file():
            print("❌ Cannot run without data file")
            sys.exit(1)
        
        # Install dependencies
        self.install_requirements()
        
        # Change to local directory
        os.chdir(self.local_dir)
        
        print("\n" + "="*50)
        print("🎯 STARTING TELEGRAM AUTO-ADD")
        print("="*50)
        
        # Run the script
        script_path = self.local_dir / self.script_name
        subprocess.run([sys.executable, str(script_path)])

if __name__ == "__main__":
    # Install requests if not available
    try:
        import requests
    except ImportError:
        print("Installing requests...")
        subprocess.run([sys.executable, "-m", "pip", "install", "requests"])
        import requests
    
    updater = GitHubAutoUpdater()
    updater.run()
EOF

chmod +x smart_github_runner.py
