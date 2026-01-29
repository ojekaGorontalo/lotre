#!/usr/bin/env python3
"""
SCRIPT BOT AUTO-INVITE BY USER ID + HTML REPORT
Ambil anggota dari grup sumber -> Bot kirim invite ke grup target
"""

import asyncio
import json
import os
import time
import csv
from datetime import datetime
from telethon import TelegramClient, errors
from telethon.tl.functions.channels import InviteToChannelRequest, GetParticipantsRequest
from telethon.tl.types import InputPeerUser, ChannelParticipantsSearch
from jinja2 import Template

# ========== KONFIGURASI ==========
API_ID = '38020832'
API_HASH = '32d3d237d7b0b74c1bfb1baa865f882c'
BOT_TOKEN = '8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw'  # Bot token Anda

# GRUP SUMBER (ambil anggota dari sini)
SOURCE_GROUP = 'vvip55wealthmabar'

# GRUP TARGET (tambah anggota ke sini)
TARGET_GROUP = '@wingo130s'

# ========== PENGATURAN ==========
MAX_SCRAPE = 200          # Max anggota di-scrape
MAX_INVITE_PER_DAY = 30   # Max invite per hari
DELAY_SECONDS = 25        # Delay antar undangan
INITIAL_DELAY = 120       # Delay awal sebelum mulai (detik)
USE_EXISTING_DATA = True  # Gunakan data yang sudah ada

# Template HTML untuk report
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Report Bot Invite - {{ title }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(to right, #4A00E0, #8E2DE2);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            opacity: 0.9;
            font-size: 1.1em;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            transition: transform 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        .stat-value {
            font-size: 3em;
            font-weight: bold;
            color: #4A00E0;
            margin: 10px 0;
        }
        .stat-label {
            color: #6c757d;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
        .info { color: #17a2b8; }
        .table-container {
            padding: 0 30px 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th {
            background: #4A00E0;
            color: white;
            padding: 15px;
            text-align: left;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #dee2e6;
        }
        tr:hover {
            background-color: #f8f9fa;
        }
        .status-success {
            background: #d4edda;
            color: #155724;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.9em;
        }
        .status-failed {
            background: #f8d7da;
            color: #721c24;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.9em;
        }
        .timestamp {
            color: #6c757d;
            font-size: 0.9em;
            margin-top: 20px;
            text-align: center;
            padding: 20px;
            border-top: 1px solid #dee2e6;
        }
        .actions {
            padding: 20px 30px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 12px 25px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s;
        }
        .btn-primary {
            background: #4A00E0;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn:hover {
            opacity: 0.9;
            transform: translateY(-2px);
        }
        .logo {
            font-size: 2em;
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 1.5em;
            margin: 30px 0 20px;
            color: #4A00E0;
            padding-bottom: 10px;
            border-bottom: 2px solid #4A00E0;
        }
        .chart-container {
            padding: 30px;
        }
        .donut-chart {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: conic-gradient(
                #28a745 {{ success_percent }}%,
                #dc3545 {{ failed_percent }}%,
                #ffc107 {{ skipped_percent }}%
            );
            margin: 0 auto;
            position: relative;
        }
        .chart-center {
            position: absolute;
            width: 100px;
            height: 100px;
            background: white;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.5em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🤖</div>
            <h1>{{ title }}</h1>
            <p>Bot Invite Report - {{ timestamp }}</p>
        </div>
        
        <div class="actions">
            <a href="scraped_users.json" class="btn btn-primary">📥 Download JSON</a>
            <a href="bot_report.csv" class="btn btn-secondary">📊 Download CSV</a>
            <button onclick="window.print()" class="btn btn-primary">🖨️ Print Report</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Users</div>
                <div class="stat-value info">{{ total_users }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Success</div>
                <div class="stat-value success">{{ success_count }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Failed</div>
                <div class="stat-value danger">{{ failed_count }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Skipped</div>
                <div class="stat-value warning">{{ skipped_count }}</div>
            </div>
        </div>
        
        <div class="chart-container">
            <h3 class="section-title">Success Rate</h3>
            <div class="donut-chart">
                <div class="chart-center">{{ success_rate }}%</div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <div style="display: inline-flex; align-items: center; margin: 0 10px;">
                    <div style="width: 20px; height: 20px; background: #28a745; margin-right: 5px;"></div>
                    <span>Success: {{ success_count }}</span>
                </div>
                <div style="display: inline-flex; align-items: center; margin: 0 10px;">
                    <div style="width: 20px; height: 20px; background: #dc3545; margin-right: 5px;"></div>
                    <span>Failed: {{ failed_count }}</span>
                </div>
                <div style="display: inline-flex; align-items: center; margin: 0 10px;">
                    <div style="width: 20px; height: 20px; background: #ffc107; margin-right: 5px;"></div>
                    <span>Skipped: {{ skipped_count }}</span>
                </div>
            </div>
        </div>
        
        <div class="table-container">
            <h3 class="section-title">User Details</h3>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Status</th>
                        <th>Message</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    {% for user in users %}
                    <tr>
                        <td>{{ loop.index }}</td>
                        <td>{{ user.id }}</td>
                        <td>{{ user.name }}</td>
                        <td>{{ user.username }}</td>
                        <td>
                            {% if user.status == 'success' %}
                                <span class="status-success">✅ Success</span>
                            {% elif user.status == 'failed' %}
                                <span class="status-failed">❌ Failed</span>
                            {% else %}
                                <span>⏸️ Skipped</span>
                            {% endif %}
                        </td>
                        <td>{{ user.message[:50] }}{% if user.message|length > 50 %}...{% endif %}</td>
                        <td>{{ user.timestamp }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        
        <div class="table-container">
            <h3 class="section-title">Configuration</h3>
            <table>
                <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>Source Group</td>
                    <td>{{ config.source_group }}</td>
                </tr>
                <tr>
                    <td>Target Group</td>
                    <td>{{ config.target_group }}</td>
                </tr>
                <tr>
                    <td>Max Scrape</td>
                    <td>{{ config.max_scrape }}</td>
                </tr>
                <tr>
                    <td>Max Invite/Day</td>
                    <td>{{ config.max_invite_per_day }}</td>
                </tr>
                <tr>
                    <td>Delay Seconds</td>
                    <td>{{ config.delay_seconds }}</td>
                </tr>
                <tr>
                    <td>Bot Username</td>
                    <td>@{{ config.bot_username }}</td>
                </tr>
            </table>
        </div>
        
        <div class="timestamp">
            Report generated on {{ timestamp }}<br>
            Script execution time: {{ execution_time }} seconds
        </div>
    </div>
</body>
</html>
"""

def print_header():
    print("\n" + "="*70)
    print("🤖 BOT AUTO-INVITE BY USER ID + HTML REPORT")
    print(f"   Sumber: {SOURCE_GROUP}")
    print(f"   Target: {TARGET_GROUP}")
    print("="*70)

async def scrape_with_user_account():
    """Scrape members using user account (not bot)"""
    print("\n🔍 SCRAPING MEMBERS (User Account)...")
    
    # Gunakan akun user untuk scraping
    user_client = TelegramClient('user_session', int(API_ID), API_HASH)
    
    try:
        await user_client.start()
        print(f"✅ Logged in as user")
        
        source_entity = await user_client.get_entity(SOURCE_GROUP)
        print(f"📥 Source group: {getattr(source_entity, 'title', SOURCE_GROUP)}")
        
        all_participants = []
        count = 0
        
        print("⏳ Scraping members...")
        
        async for user in user_client.iter_participants(source_entity, limit=MAX_SCRAPE):
            count += 1
            if not user.bot:
                member_data = {
                    'id': user.id,
                    'access_hash': user.access_hash if hasattr(user, 'access_hash') else 0,
                    'username': f"@{user.username}" if user.username else "NO_USERNAME",
                    'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or f"User_{user.id}",
                    'first_name': user.first_name or "",
                    'last_name': user.last_name or "",
                    'phone': user.phone or "",
                    'bot': user.bot
                }
                all_participants.append(member_data)
            
            if count % 50 == 0:
                print(f"   Scraped: {count} members")
        
        print(f"\n📊 SCRAPING RESULTS:")
        print(f"   • Total scraped: {count}")
        print(f"   • Non-bot users: {len(all_participants)}")
        print(f"   • With username: {len([u for u in all_participants if u['username'] != 'NO_USERNAME'])}")
        print(f"   • Without username: {len([u for u in all_participants if u['username'] == 'NO_USERNAME'])}")
        
        if not all_participants:
            print("❌ No users found")
            return None
        
        # Save to JSON
        with open('scraped_users.json', 'w', encoding='utf-8') as f:
            json.dump({
                'scraped_at': datetime.now().isoformat(),
                'source_group': SOURCE_GROUP,
                'total_members': len(all_participants),
                'members': all_participants
            }, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved to: scraped_users.json")
        return all_participants
        
    except Exception as e:
        print(f"❌ Error scraping: {e}")
        return None
    finally:
        await user_client.disconnect()

async def load_existing_data():
    """Load existing scraped data"""
    if os.path.exists('scraped_users.json'):
        try:
            with open('scraped_users.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"✅ Loaded {len(data.get('members', []))} users from scraped_users.json")
                return data.get('members', [])
        except Exception as e:
            print(f"❌ Error loading existing data: {e}")
    return None

async def bot_send_invites(users_to_invite):
    """Bot sends invites to users"""
    print(f"\n🤖 BOT SENDING INVITES...")
    
    # Login dengan bot
    bot = TelegramClient('bot_session', int(API_ID), API_HASH)
    await bot.start(bot_token=BOT_TOKEN)
    
    bot_info = await bot.get_me()
    print(f"✅ Bot: @{bot_info.username} (ID: {bot_info.id})")
    
    results = []
    success_count = 0
    failed_count = 0
    skipped_count = 0
    
    try:
        # Dapatkan target group
        target_entity = await bot.get_entity(TARGET_GROUP)
        print(f"🎯 Target group: {getattr(target_entity, 'title', TARGET_GROUP)}")
        
        # Coba buat invite link (jika bot admin)
        invite_link = None
        try:
            from telethon.tl.functions.messages import ExportChatInviteRequest
            invite = await bot(ExportChatInviteRequest(target_entity))
            invite_link = invite.link
            print(f"🔗 Invite link: {invite_link}")
        except:
            print("⚠️ Bot is not admin, using direct invite method")
        
        print(f"\n📤 Will invite {len(users_to_invite)} users")
        print(f"⏳ Initial delay: {INITIAL_DELAY} seconds...")
        await asyncio.sleep(INITIAL_DELAY)
        
        for i, user in enumerate(users_to_invite):
            user_id = user['id']
            name = user['name']
            username = user['username']
            
            print(f"\n[{i+1}/{len(users_to_invite)}] User: {name}")
            print(f"   ID: {user_id} | Username: {username}")
            
            result = {
                'id': user_id,
                'name': name,
                'username': username,
                'status': 'pending',
                'message': '',
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
            
            try:
                # Coba dapatkan entity user
                try:
                    user_entity = await bot.get_input_entity(user_id)
                except Exception as e:
                    print(f"   ❌ Cannot get user entity: {str(e)[:50]}")
                    result['status'] = 'failed'
                    result['message'] = f"Cannot get user entity: {str(e)[:100]}"
                    failed_count += 1
                    results.append(result)
                    continue
                
                # Jika bot admin, gunakan direct invite
                if invite_link:
                    try:
                        # Direct invite dengan bot (jika admin)
                        await bot(InviteToChannelRequest(
                            channel=target_entity,
                            users=[user_entity]
                        ))
                        print(f"   ✅ Direct invite sent")
                        result['status'] = 'success'
                        result['message'] = 'Direct invite sent by bot'
                        success_count += 1
                        
                    except errors.UserPrivacyRestrictedError:
                        print(f"   🔒 User privacy restricted")
                        result['status'] = 'failed'
                        result['message'] = 'User privacy restricted'
                        failed_count += 1
                        
                    except errors.UserAlreadyParticipantError:
                        print(f"   ℹ️ User already in group")
                        result['status'] = 'success'
                        result['message'] = 'User already in group'
                        success_count += 1
                        
                    except errors.FloodWaitError as e:
                        wait = e.seconds
                        print(f"   ⏳ FloodWait: {wait} seconds")
                        result['status'] = 'failed'
                        result['message'] = f'FloodWait {wait} seconds'
                        failed_count += 1
                        
                        # Tunggu sesuai permintaan
                        if wait > 0:
                            print(f"   💤 Waiting {wait} seconds...")
                            await asyncio.sleep(wait)
                            
                    except Exception as e:
                        error_msg = str(e)
                        print(f"   ❌ Error: {error_msg[:60]}")
                        result['status'] = 'failed'
                        result['message'] = error_msg[:100]
                        failed_count += 1
                else:
                    # Jika bot bukan admin, kirim pesan dengan invite link
                    # (Butuh user sudah /start dengan bot)
                    print(f"   ⚠️ Bot not admin, skipping direct invite")
                    result['status'] = 'skipped'
                    result['message'] = 'Bot not admin, cannot send direct invite'
                    skipped_count += 1
                    
            except Exception as e:
                error_msg = str(e)
                print(f"   ❌ Unexpected error: {error_msg[:60]}")
                result['status'] = 'failed'
                result['message'] = f"Unexpected error: {error_msg[:100]}"
                failed_count += 1
            
            results.append(result)
            
            # Save progress setiap 10 user
            if (i + 1) % 10 == 0:
                save_progress(results, success_count, failed_count, skipped_count)
            
            # Delay antar user
            if i < len(users_to_invite) - 1:
                print(f"   ⏰ Delay {DELAY_SECONDS} seconds...")
                await asyncio.sleep(DELAY_SECONDS)
        
        # Final save
        save_progress(results, success_count, failed_count, skipped_count)
        
        return results, success_count, failed_count, skipped_count
        
    except Exception as e:
        print(f"\n❌ Bot error: {e}")
        return results, success_count, failed_count, skipped_count
    finally:
        await bot.disconnect()

def save_progress(results, success, failed, skipped):
    """Save progress to file"""
    progress = {
        'last_update': datetime.now().isoformat(),
        'total_processed': len(results),
        'success': success,
        'failed': failed,
        'skipped': skipped,
        'results': results
    }
    
    with open('bot_progress.json', 'w', encoding='utf-8') as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)

def generate_html_report(results, total_users, success, failed, skipped, config):
    """Generate HTML report"""
    print("\n📊 GENERATING HTML REPORT...")
    
    # Hitung persentase
    success_rate = (success / total_users * 100) if total_users > 0 else 0
    success_percent = (success / total_users * 100) if total_users > 0 else 0
    failed_percent = (failed / total_users * 100) if total_users > 0 else 0
    skipped_percent = (skipped / total_users * 100) if total_users > 0 else 0
    
    # Data untuk template
    template_data = {
        'title': 'Bot Invitation Report',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_users': total_users,
        'success_count': success,
        'failed_count': failed,
        'skipped_count': skipped,
        'success_rate': round(success_rate, 1),
        'success_percent': success_percent,
        'failed_percent': failed_percent,
        'skipped_percent': skipped_percent,
        'users': results[:100],  # Limit untuk display
        'config': config,
        'execution_time': round(time.time() - start_time, 2)
    }
    
    # Render HTML
    template = Template(HTML_TEMPLATE)
    html_output = template.render(**template_data)
    
    # Save HTML file
    with open('bot_report.html', 'w', encoding='utf-8') as f:
        f.write(html_output)
    
    # Juga simpan ke CSV
    with open('bot_report.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['User ID', 'Name', 'Username', 'Status', 'Message', 'Timestamp'])
        for user in results:
            writer.writerow([
                user['id'],
                user['name'],
                user['username'],
                user['status'],
                user['message'],
                user['timestamp']
            ])
    
    print(f"📁 HTML Report: bot_report.html")
    print(f"📊 CSV Report: bot_report.csv")

async def main():
    global start_time
    start_time = time.time()
    
    print_header()
    
    # Step 1: Ambil data user
    users = []
    if USE_EXISTING_DATA:
        users = await load_existing_data()
    
    if not users:
        print("\n⚠️ No existing data found, scraping with user account...")
        users = await scrape_with_user_account()
        if not users:
            print("❌ Failed to get user data")
            return
    
    # Step 2: Konfirmasi
    print(f"\n👥 FOUND {len(users)} USERS")
    print("Preview:")
    for i, user in enumerate(users[:5]):
        print(f"  {i+1}. {user['name']} - {user['username']}")
    
    if len(users) > 5:
        print(f"  ... and {len(users) - 5} more")
    
    # Limit jumlah yang akan diinvite
    to_invite = users[:MAX_INVITE_PER_DAY]
    print(f"\n🎯 Will invite {len(to_invite)} users today (max {MAX_INVITE_PER_DAY}/day)")
    
    confirm = input("\n🚀 START BOT INVITES? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Cancelled")
        return
    
    # Step 3: Bot kirim invites
    results, success, failed, skipped = await bot_send_invites(to_invite)
    
    # Step 4: Generate report
    config = {
        'source_group': SOURCE_GROUP,
        'target_group': TARGET_GROUP,
        'max_scrape': MAX_SCRAPE,
        'max_invite_per_day': MAX_INVITE_PER_DAY,
        'delay_seconds': DELAY_SECONDS,
        'bot_username': BOT_TOKEN.split(':')[0] if ':' in BOT_TOKEN else 'unknown'
    }
    
    generate_html_report(results, len(to_invite), success, failed, skipped, config)
    
    # Step 5: Tampilkan summary
    print("\n" + "="*70)
    print("📈 FINAL RESULTS")
    print("="*70)
    print(f"   ✅ Success: {success}")
    print(f"   ❌ Failed: {failed}")
    print(f"   ⏸️ Skipped: {skipped}")
    print(f"   🎯 Target: {len(to_invite)}")
    print(f"   ⏱️  Time: {round(time.time() - start_time, 2)} seconds")
    print("\n📁 FILES GENERATED:")
    print(f"   • bot_report.html - HTML report")
    print(f"   • bot_report.csv - CSV data")
    print(f"   • scraped_users.json - User data")
    print(f"   • bot_progress.json - Progress data")
    print("\n💡 TIPS:")
    print(f"   • Open bot_report.html in browser to view report")
    print(f"   • Wait 24 hours before next batch")
    print("="*70)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n❌ Script interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
