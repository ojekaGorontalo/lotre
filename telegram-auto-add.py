#!/usr/bin/env python3
"""
SCRIPT AUTO-ADD BY USER ID (NO USERNAME REQUIRED)
Ambil anggota dari grup sumber -> Tambah ke grup target menggunakan USER_ID
"""

import asyncio
import json
import os
import time
from datetime import datetime
from telethon import TelegramClient, errors
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.functions.messages import GetFullChatRequest
from telethon.tl.types import InputPeerUser, InputPeerChannel, InputUser
from telethon.tl.functions.users import GetUsersRequest

# ========== KONFIGURASI ==========
API_ID = '38020832'
API_HASH = '32d3d237d7b0b74c1bfb1baa865f882c'

# GRUP SUMBER (ambil anggota dari sini)
SOURCE_GROUP = 'vvip55wealthmabar'  # atau gunakan link: https://t.me/vvip55wealthmabar

# GRUP TARGET (tambah anggota ke sini)
TARGET_GROUP = '@wingo130s'  # atau gunakan ID: -1001234567890

# ========== PENGATURAN AMAN ==========
MAX_SCRAPE = 200          # Max anggota di-scrape dari grup sumber
MAX_ADD_PER_DAY = 50      # Max tambah per hari (meningkat dari 15)
DELAY_SECONDS = 15        # Delay 15 detik antar undangan (bukan menit)
RETRY_DELAY = 60          # Tunggu 60 detik jika error
USE_SAVED_USERS = True    # Gunakan file saved_users.json jika ada

def print_header():
    print("\n" + "="*60)
    print("🚀 TELEGRAM MEMBER MIGRATION BY USER_ID")
    print(f"   Sumber: {SOURCE_GROUP}")
    print(f"   Target: {TARGET_GROUP}")
    print("="*60)

async def scrape_users_by_id(client):
    """Ambil semua anggota dari grup sumber menggunakan user_id"""
    print(f"\n🔍 MENGAMBIL ANGGOTA DARI GRUP: {SOURCE_GROUP}")
    
    try:
        # Dapatkan entity grup sumber
        source_entity = await client.get_entity(SOURCE_GROUP)
        print(f"✅ Grup ditemukan: {getattr(source_entity, 'title', 'Unknown')}")
        
        all_participants = []
        count = 0
        
        print("📥 Sedang mengambil daftar anggota (by user_id)...")
        
        # Ambil semua peserta menggunakan iter_participants (lebih sederhana)
        async for user in client.iter_participants(source_entity, limit=MAX_SCRAPE):
            count += 1
            # Ambil SEMUA user yang bukan bot (termasuk tanpa username)
            if not user.bot:  # Hanya filter bot saja
                member_data = {
                    'id': user.id,
                    'access_hash': user.access_hash if hasattr(user, 'access_hash') else 0,
                    'username': f"@{user.username}" if user.username else "NO_USERNAME",
                    'first_name': user.first_name or "",
                    'last_name': user.last_name or "",
                    'full_name': f"{user.first_name or ''} {user.last_name or ''}".strip(),
                    'phone': user.phone or "",
                    'bot': user.bot,
                    'scam': user.scam if hasattr(user, 'scam') else False,
                    'restricted': user.restricted if hasattr(user, 'restricted') else False,
                    'deleted': user.deleted if hasattr(user, 'deleted') else False
                }
                all_participants.append(member_data)
            
            if count % 50 == 0:
                print(f"   Diambil: {count} anggota")
        
        print(f"\n📊 HASIL SCRAPING:")
        print(f"   • Total user diambil: {count}")
        print(f"   • Non-bot (akan diproses): {len(all_participants)}")
        print(f"   • Dengan username: {len([u for u in all_participants if u['username'] != 'NO_USERNAME'])}")
        print(f"   • Tanpa username: {len([u for u in all_participants if u['username'] == 'NO_USERNAME'])}")
        
        if len(all_participants) == 0:
            print("❌ Tidak ada anggota yang bisa diproses")
            return None
        
        # Simpan ke file untuk backup
        with open('scraped_users.json', 'w', encoding='utf-8') as f:
            json.dump({
                'scraped_at': datetime.now().isoformat(),
                'source_group': SOURCE_GROUP,
                'total_members': len(all_participants),
                'members': all_participants
            }, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Data tersimpan: scraped_users.json")
        return all_participants
        
    except errors.ChannelPrivateError:
        print("❌ Tidak bisa akses grup (grup private atau tidak ada izin)")
        return None
    except Exception as e:
        print(f"❌ Error saat mengambil anggota: {e}")
        import traceback
        traceback.print_exc()
        return None

async def add_users_by_id(client, users_to_add, target_entity):
    """Tambahkan anggota ke grup target menggunakan USER_ID"""
    print(f"\n🎯 MENAMBAH KE GRUP TARGET: {TARGET_GROUP}")
    print(f"   • Akan diproses: {len(users_to_add)} anggota")
    print(f"   • Estimasi waktu: {len(users_to_add) * DELAY_SECONDS / 60:.1f} menit")
    
    success_count = 0
    failed_count = 0
    failed_users = []
    
    # Konfirmasi sebelum mulai
    confirm = input("\n🚀 LANJUTKAN PROSES UNDANGAN? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Dibatalkan")
        return success_count, failed_count, failed_users
    
    print("\n" + "="*50)
    print("🚀 PROSES UNDANGAN BY USER_ID DIMULAI")
    print("="*50)
    
    # Cek akses admin di grup target
    try:
        my_permissions = await client.get_permissions(target_entity, 'me')
        if not my_permissions.invite_users:
            print("❌ Anda tidak punya izin 'invite_users' di grup target!")
            return 0, 0, []
    except:
        print("⚠️ Tidak bisa cek permissions, lanjutkan dengan hati-hati")
    
    for i, user in enumerate(users_to_add):
        user_id = user['id']
        name = user['full_name'] or user['first_name'] or f"User_{user_id}"
        has_username = user['username'] != 'NO_USERNAME'
        
        print(f"\n[{i+1}/{len(users_to_add)}] ID: {user_id}")
        print(f"   👤 Name: {name[:30]}")
        print(f"   📛 Username: {user['username'] if has_username else 'Tidak ada'}")
        
        try:
            # Coba tambahkan menggunakan InputPeerUser
            # Kita butuh mendapatkan entity user dulu
            try:
                user_entity = await client.get_input_entity(user_id)
            except ValueError:
                # Jika tidak bisa dapatkan entity, coba dengan access_hash
                if user.get('access_hash'):
                    user_entity = InputPeerUser(
                        user_id=user_id,
                        access_hash=user['access_hash']
                    )
                else:
                    print(f"   ❌ Skip: Tidak bisa dapatkan entity untuk user_id {user_id}")
                    failed_count += 1
                    failed_users.append({
                        'user_id': user_id,
                        'name': name,
                        'error': 'Cannot get user entity'
                    })
                    continue
            
            # Kirim undangan
            print(f"   📨 Mengundang...")
            result = await client(InviteToChannelRequest(
                channel=target_entity,
                users=[user_entity]
            ))
            
            print(f"   ✅ BERHASIL diundang!")
            success_count += 1
            
            # Log sukses
            with open('migration_success.log', 'a', encoding='utf-8') as f:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                f.write(f"{timestamp} | ID:{user_id} | Name:{name} | Username:{user['username']}\n")
            
            # Simpan progress
            progress = {
                'last_added': user_id,
                'success_count': success_count,
                'timestamp': datetime.now().isoformat()
            }
            with open('progress.json', 'w') as f:
                json.dump(progress, f)
                
        except errors.UserPrivacyRestrictedError:
            print(f"   🔒 Gagal: User privacy restricted")
            failed_count += 1
            failed_users.append({
                'user_id': user_id,
                'name': name,
                'error': 'User privacy restricted'
            })
            
        except errors.FloodWaitError as e:
            wait = e.seconds
            print(f"   ⏳ FloodWait: tunggu {wait//60} menit")
            failed_count += 1
            failed_users.append({
                'user_id': user_id,
                'name': name,
                'error': f'FloodWait {wait} seconds'
            })
            
            # Tunggu sesuai permintaan Telegram
            print(f"   ⏰ Menunggu {wait} detik...")
            for sec in range(wait, 0, -1):
                if sec % 30 == 0 or sec <= 10:
                    print(f"      {sec} detik tersisa")
                await asyncio.sleep(1)
                
        except errors.UserAlreadyParticipantError:
            print(f"   ℹ️  User sudah anggota grup")
            success_count += 1  # Dianggap sukses
            
        except errors.UserNotMutualContactError:
            print(f"   🤝 Gagal: User bukan mutual contact")
            failed_count += 1
            failed_users.append({
                'user_id': user_id,
                'name': name,
                'error': 'Not mutual contact'
            })
            
        except errors.PeerIdInvalidError:
            print(f"   🆔 Gagal: User ID invalid")
            failed_count += 1
            failed_users.append({
                'user_id': user_id,
                'name': name,
                'error': 'Invalid user ID'
            })
            
        except Exception as e:
            error_msg = str(e)
            print(f"   ❌ Gagal: {error_msg[:80]}")
            failed_count += 1
            failed_users.append({
                'user_id': user_id,
                'name': name,
                'error': error_msg[:100]
            })
        
        # Delay antar undangan (kecuali yang terakhir)
        if i < len(users_to_add) - 1:
            print(f"   ⏰ Delay {DELAY_SECONDS} detik...")
            await asyncio.sleep(DELAY_SECONDS)
    
    return success_count, failed_count, failed_users

async def load_saved_users():
    """Load user dari file saved_users.json"""
    if os.path.exists('scraped_users.json'):
        with open('scraped_users.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('members', [])
    return None

async def main():
    print_header()
    
    # Inisialisasi client
    client = TelegramClient('migration_session_userid', int(API_ID), API_HASH)
    
    try:
        # Login
        print("\n🔗 Menghubungkan ke Telegram...")
        await client.start()
        me = await client.get_me()
        print(f"✅ Login berhasil: {me.first_name} (@{me.username if me.username else 'no_username'})")
        print(f"   Your User ID: {me.id}")
        
        # Cek apakah ada data tersimpan
        saved_users = None
        if USE_SAVED_USERS and os.path.exists('scraped_users.json'):
            use_saved = input("\n📂 Data scraped_users.json ditemukan. Gunakan data ini? (y/n): ").strip().lower()
            if use_saved == 'y':
                saved_users = await load_saved_users()
                if saved_users:
                    print(f"✅ Load {len(saved_users)} user dari file")
        
        # STEP 1: Ambil anggota dari grup sumber
        if not saved_users:
            source_users = await scrape_users_by_id(client)
            if not source_users:
                return
        else:
            source_users = saved_users
        
        # Tampilkan preview
        print("\n👥 PREVIEW ANGGOTA YANG AKAN DITAMBAHKAN (BY USER_ID):")
        for i, user in enumerate(source_users[:5]):
            name = user['full_name'] or user['first_name'] or f"User_{user['id']}"
            username = user['username']
            print(f"   {i+1}. ID:{user['id']} - {name[:20]:20} - {username}")
        
        if len(source_users) > 5:
            print(f"   ... dan {len(source_users) - 5} lainnya")
        
        # Limit jumlah yang akan ditambahkan hari ini
        add_today = source_users[:MAX_ADD_PER_DAY]
        print(f"\n📌 Akan ditambahkan hari ini: {len(add_today)} anggota (max {MAX_ADD_PER_DAY}/hari)")
        
        # STEP 2: Dapatkan grup target
        print(f"\n🔍 Mencari grup target {TARGET_GROUP}...")
        try:
            target_entity = await client.get_entity(TARGET_GROUP)
            print(f"✅ Grup target ditemukan: {getattr(target_entity, 'title', TARGET_GROUP)}")
            print(f"   Chat ID: {target_entity.id}")
        except Exception as e:
            print(f"❌ Gagal mendapatkan grup target: {e}")
            return
        
        # STEP 3: Tambahkan ke grup target menggunakan user_id
        success, failed, failed_list = await add_users_by_id(client, add_today, target_entity)
        
        # Hasil akhir
        print("\n" + "="*60)
        print("📊 HASIL AKHIR MIGRASI BY USER_ID")
        print("="*60)
        print(f"   ✅ Berhasil diundang: {success} anggota")
        print(f"   ❌ Gagal: {failed} anggota")
        print(f"   🎯 Target hari ini: {len(add_today)} anggota")
        
        if failed_list:
            with open('failed_users.json', 'w', encoding='utf-8') as f:
                json.dump(failed_list, f, indent=2, ensure_ascii=False)
            print(f"📄 List gagal disimpan: failed_users.json")
        
        if success > 0:
            print(f"\n🎉 {success} anggota berhasil dimigrasikan!")
            print(f"📁 Log sukses: migration_success.log")
            
            # Simpan sisa data untuk batch berikutnya
            remaining = source_users[MAX_ADD_PER_DAY:]
            if remaining:
                with open('remaining_users.json', 'w', encoding='utf-8') as f:
                    json.dump({
                        'remaining_count': len(remaining),
                        'members': remaining
                    }, f, indent=2, ensure_ascii=False)
                print(f"💾 Sisa anggota disimpan: remaining_users.json")
                print(f"⏳ Batch berikutnya: {len(remaining)} anggota")
                print("💤 Rekomendasi: Tunggu minimal 12 jam sebelum melanjutkan")
        
        print("\n📝 CATATAN:")
        print("   • User tanpa username TETAP bisa diinvite dengan user_id")
        print("   • Beberapa user mungkin punya privacy settings tinggi")
        print("   • FloodWait normal, itu proteksi Telegram")
        
    except Exception as e:
        print(f"\n❌ Error sistem: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        await client.disconnect()
        print("\n" + "="*60)
        print("👋 SESI SELESAI")
        print("="*60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n❌ Script dihentikan oleh user")
    except Exception as e:
        print(f"\n❌ Error runtime: {e}")
