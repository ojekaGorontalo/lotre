#!/usr/bin/env python3
"""
TELEGRAM AUTO-ADD SCRIPT - Versi Fix
Script untuk menambahkan anggota ke grup Telegram secara otomatis
Safe limit: 15 anggota/hari dengan delay 8 menit
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta
from telethon import TelegramClient
from telethon.errors import FloodWaitError, UserPrivacyRestrictedError
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.types import InputPeerUser

# ========== KONFIGURASI ==========
API_ID = '31482798'
API_HASH = '51e45c6e6b8788d2de69d1574293ee82'
TARGET_GROUP = '@wingo130s'

# ========== PENGATURAN AMAN ==========
MAX_PER_DAY = 15          # Maksimal 15 anggota per hari (AMAN)
DELAY_MINUTES = 1         # Delay 1 menit antar anggota
DATA_FILE = 'anggota_telegram.json'

def show_banner():
    """Tampilkan banner"""
    print("\n" + "="*50)
    print("🚀 TELEGRAM AUTO-ADD SYSTEM v1.0")
    print("   Safe Mode: 15 anggota/hari")
    print("="*50)

async def main():
    show_banner()
    
    print(f"\n📋 KONFIGURASI:")
    print(f"   • Target grup: {TARGET_GROUP}")
    print(f"   • Limit/hari: {MAX_PER_DAY} anggota")
    print(f"   • Delay: {DELAY_MINUTES} menit")
    print()
    
    # Cek file data
    if not os.path.exists(DATA_FILE):
        print(f"❌ File {DATA_FILE} tidak ditemukan!")
        print(f"💡 Pastikan file '{DATA_FILE}' ada di direktori yang sama")
        return
    
    # Load data
    print("📥 Memuat data anggota...")
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Ekstrak data anggota
        if isinstance(data, dict) and 'members' in data:
            members = data['members']
        elif isinstance(data, list):
            members = data
        else:
            print("❌ Format data tidak valid")
            return
        
        # Filter hanya yang punya username valid
        valid_members = []
        invalid_count = 0
        
        for member in members:
            username = member.get('username', '').strip()
            
            # Username valid jika:
            # 1. Tidak kosong
            # 2. Bukan '-', '@-'
            # 3. Minimal 3 karakter
            if (username and 
                username not in ['-', '@-', ''] and
                len(username.replace('@', '')) >= 3):
                
                # Normalisasi: pastikan ada @ di depan
                if not username.startswith('@'):
                    username = '@' + username
                member['username'] = username
                valid_members.append(member)
            else:
                invalid_count += 1
        
        print(f"✅ Data loaded: {len(members)} anggota total")
        print(f"📊 Valid: {len(valid_members)} anggota, Invalid: {invalid_count} anggota")
        
        if len(valid_members) == 0:
            print("❌ Tidak ada anggota dengan username valid!")
            return
        
        # Ambil batch hari ini
        batch_size = min(MAX_PER_DAY, len(valid_members))
        today_batch = valid_members[:batch_size]
        
        print(f"\n🎯 BATCH HARI INI:")
        print(f"   • Akan diproses: {len(today_batch)} anggota")
        print(f"   • Estimasi waktu: {len(today_batch) * DELAY_MINUTES} menit")
        print()
        
        # Tampilkan preview
        print("👥 PREVIEW (5 pertama):")
        for i, member in enumerate(today_batch[:5]):
            name = member.get('full_name') or member.get('first_name') or member.get('name') or 'No Name'
            username = member['username']
            print(f"   {i+1}. {name[:20]:20} - {username}")
        
        if len(today_batch) > 5:
            print(f"   ... dan {len(today_batch) - 5} lainnya")
        
        print()
        
        # Konfirmasi
        confirm = input("🚀 LANJUTKAN? (y/n): ").strip().lower()
        if confirm != 'y':
            print("❌ Dibatalkan")
            return
        
        # Inisialisasi client Telegram
        client = TelegramClient('telegram_session', int(API_ID), API_HASH)
        
        try:
            print("\n🔗 Menghubungkan ke Telegram...")
            await client.start()
            me = await client.get_me()
            print(f"✅ Login berhasil: {me.first_name} (@{me.username})")
            
            # Dapatkan grup target
            print(f"\n🔍 Mencari grup {TARGET_GROUP}...")
            try:
                target = await client.get_input_entity(TARGET_GROUP)
                print(f"✅ Grup ditemukan")
            except Exception as e:
                print(f"❌ Gagal dapatkan grup: {e}")
                return
            
            print("\n" + "="*50)
            print("🚀 PROSES AUTO-ADD DIMULAI")
            print("="*50)
            
            # Variabel statistik
            success_count = 0
            failed_count = 0
            
            # Proses setiap anggota
            for i, member in enumerate(today_batch):
                name = member.get('full_name') or member.get('first_name') or member.get('name') or 'No Name'
                username = member['username'].replace('@', '').strip()
                
                print(f"\n[{i+1}/{len(today_batch)}] {name}")
                print(f"   👤 Username: @{username}")
                
                try:
                    # Cari user berdasarkan username
                    user = await client.get_entity(username)
                    
                    # Buat input user untuk undangan
                    input_user = InputPeerUser(user.id, user.access_hash)
                    
                    # Kirim undangan
                    print(f"   📨 Mengundang ke grup...")
                    await client(InviteToChannelRequest(
                        channel=target,
                        users=[input_user]
                    ))
                    
                    print(f"   ✅ BERHASIL diundang!")
                    success_count += 1
                    
                    # Log sukses
                    with open('success_log.txt', 'a', encoding='utf-8') as f:
                        f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {name} | @{username}\n")
                
                except UserPrivacyRestrictedError:
                    print(f"   🔒 Gagal: User privacy restricted")
                    failed_count += 1
                
                except FloodWaitError as e:
                    wait = e.seconds
                    print(f"   ⏳ FloodWait: tunggu {wait//60} menit")
                    failed_count += 1
                    
                    # Tunggu sesuai permintaan Telegram
                    for minute in range(wait//60, 0, -1):
                        if minute % 5 == 0 or minute <= 3:
                            print(f"      {minute} menit tersisa")
                        await asyncio.sleep(60)
                
                except Exception as e:
                    error_msg = str(e)
                    print(f"   ❌ Gagal: {error_msg[:50]}")
                    failed_count += 1
                
                # Delay antar anggota (kecuali yang terakhir)
                if i < len(today_batch) - 1:
                    print(f"\n   ⏰ Delay {DELAY_MINUTES} menit...")
                    for minute in range(DELAY_MINUTES, 0, -1):
                        if minute % 2 == 0:
                            print(f"      {minute} menit tersisa")
                        await asyncio.sleep(60)
            
            # Tampilkan hasil akhir
            print("\n" + "="*50)
            print("📊 HASIL AKHIR")
            print("="*50)
            print(f"   ✅ Berhasil: {success_count} anggota")
            print(f"   ❌ Gagal: {failed_count} anggota")
            print(f"   🎯 Target: {len(today_batch)} anggota")
            
            if success_count > 0:
                print(f"\n🎉 {success_count} anggota berhasil ditambahkan!")
                remaining = len(valid_members) - batch_size
                if remaining > 0:
                    print(f"⏳ Sisa: {remaining} anggota ({remaining//MAX_PER_DAY + 1} hari lagi)")
                    print(f"💤 Rekomendasi: Tunggu 24 jam untuk batch berikutnya")
            
            # Update summary log
            with open('summary.txt', 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now().strftime('%Y-%m-%d')} | Success: {success_count} | Failed: {failed_count}\n")
        
        except Exception as e:
            print(f"❌ Error sistem: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            await client.disconnect()
            print("\n" + "="*50)
            print("👋 SESI SELESAI")
            print("="*50)
    
    except Exception as e:
        print(f"❌ Error load data: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n❌ Script dihentikan oleh user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
