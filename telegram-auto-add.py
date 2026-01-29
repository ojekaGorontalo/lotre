#!/usr/bin/env python3
"""
SCRIPT AUTO-ADD DARI GRUP TELEGRAM
Fitur: Ambil anggota dari grup sumber -> Tambah ke grup target
"""

import asyncio
import json
import os
from datetime import datetime
from telethon import TelegramClient, errors
from telethon.tl.functions.channels import (
    GetParticipantsRequest,
    InviteToChannelRequest
)
from telethon.tl.types import (
    ChannelParticipantsSearch,
    InputPeerChannel,
    InputPeerUser
)

# ========== KONFIGURASI ==========
API_ID = '31482798'
API_HASH = '51e45c6e6b8788d2de69d1574293ee82'

# GRUP SUMBER (ambil anggota dari sini)
SOURCE_GROUP = 'vvip55wealthmabar'  # atau gunakan link: https://t.me/vvip55wealthmabar
# GRUP TARGET (tambah anggota ke sini)
TARGET_GROUP = '@wingo130s'

# ========== PENGATURAN AMAN ==========
MAX_SCRAPE = 200          # Max anggota di-scrape dari grup sumber
MAX_ADD_PER_DAY = 15      # Max tambah per hari
DELAY_MINUTES = 8         # Delay antar undangan

def print_header():
    print("\n" + "="*60)
    print("🚀 TELEGRAM MEMBER MIGRATION TOOL")
    print(f"   Sumber: {SOURCE_GROUP}")
    print(f"   Target: {TARGET_GROUP}")
    print("="*60)

async def scrape_source_group(client):
    """Ambil anggota dari grup sumber"""
    print(f"\n🔍 MENGAMBIL ANGGOTA DARI GRUP: {SOURCE_GROUP}")
    
    try:
        # Dapatkan entity grup sumber
        source_entity = await client.get_entity(SOURCE_GROUP)
        print(f"✅ Grup ditemukan: {getattr(source_entity, 'title', 'Unknown')}")
        
        # Inisialisasi variabel
        all_participants = []
        offset = 0
        limit = 100
        
        print("📥 Sedang mengambil daftar anggota...")
        
        # Loop untuk ambil semua peserta (dengan limit MAX_SCRAPE)
        while len(all_participants) < MAX_SCRAPE:
            participants = await client(GetParticipantsRequest(
                channel=source_entity,
                filter=ChannelParticipantsSearch(''),  # Ambil semua
                offset=offset,
                limit=limit,
                hash=0
            ))
            
            if not participants.users:
                break
            
            # Proses setiap user
            for user in participants.users:
                if len(all_participants) >= MAX_SCRAPE:
                    break
                    
                # Hanya ambil user yang bukan bot dan punya username
                if not user.bot and user.username:
                    member_data = {
                        'id': user.id,
                        'access_hash': user.access_hash,
                        'username': f"@{user.username}",
                        'first_name': user.first_name or "",
                        'last_name': user.last_name or "",
                        'full_name': f"{user.first_name or ''} {user.last_name or ''}".strip(),
                        'phone': user.phone or "",
                        'bot': user.bot,
                        'scam': user.scam
                    }
                    all_participants.append(member_data)
            
            offset += len(participants.users)
            print(f"   Diambil: {len(all_participants)}/{MAX_SCRAPE} anggota")
            
            if len(participants.users) < limit:
                break
        
        print(f"\n📊 HASIL SCRAPING:")
        print(f"   • Total user di grup: {len(all_participants)}")
        print(f"   • Dengan username valid: {len(all_participants)}")
        
        if len(all_participants) == 0:
            print("❌ Tidak ada anggota dengan username di grup sumber")
            return None
        
        return all_participants
        
    except errors.ChannelPrivateError:
        print("❌ Tidak bisa akses grup (grup private atau tidak ada izin)")
        return None
    except Exception as e:
        print(f"❌ Error saat mengambil anggota: {e}")
        return None

async def add_to_target_group(client, members_to_add, target_channel):
    """Tambahkan anggota ke grup target"""
    print(f"\n🎯 MENAMBAH KE GRUP TARGET: {TARGET_GROUP}")
    print(f"   • Akan diproses: {len(members_to_add)} anggota")
    print(f"   • Estimasi waktu: {len(members_to_add) * DELAY_MINUTES} menit")
    
    success_count = 0
    failed_count = 0
    
    # Konfirmasi sebelum mulai
    confirm = input("\n🚀 LANJUTKAN PROSES UNDANGAN? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Dibatalkan")
        return success_count, failed_count
    
    print("\n" + "="*50)
    print("🚀 PROSES UNDANGAN DIMULAI")
    print("="*50)
    
    for i, member in enumerate(members_to_add):
        name = member.get('full_name') or member.get('first_name') or 'No Name'
        username = member['username']
        
        print(f"\n[{i+1}/{len(members_to_add)}] {name}")
        print(f"   👤 Username: {username}")
        print(f"   🆔 User ID: {member['id']}")
        
        try:
            # Buat InputPeerUser dari data yang sudah ada
            input_user = InputPeerUser(
                user_id=member['id'],
                access_hash=member['access_hash']
            )
            
            # Kirim undangan
            print(f"   📨 Mengundang ke grup target...")
            await client(InviteToChannelRequest(
                channel=target_channel,
                users=[input_user]
            ))
            
            print(f"   ✅ BERHASIL diundang!")
            success_count += 1
            
            # Log sukses
            with open('migration_log.txt', 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {name} | {username}\n")
                
        except errors.UserPrivacyRestrictedError:
            print(f"   🔒 Gagal: User privacy restricted")
            failed_count += 1
            
        except errors.FloodWaitError as e:
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
            print(f"   ❌ Gagal: {error_msg[:60]}")
            failed_count += 1
        
        # Delay antar undangan (kecuali yang terakhir)
        if i < len(members_to_add) - 1:
            print(f"\n   ⏰ Delay {DELAY_MINUTES} menit...")
            for minute in range(DELAY_MINUTES, 0, -1):
                if minute % 2 == 0:
                    print(f"      {minute} menit tersisa")
                await asyncio.sleep(60)
    
    return success_count, failed_count

async def main():
    print_header()
    
    # Inisialisasi client
    client = TelegramClient('migration_session', int(API_ID), API_HASH)
    
    try:
        # Login
        print("\n🔗 Menghubungkan ke Telegram...")
        await client.start()
        me = await client.get_me()
        print(f"✅ Login berhasil: {me.first_name} (@{me.username})")
        
        # STEP 1: Ambil anggota dari grup sumber
        source_members = await scrape_source_group(client)
        if not source_members:
            return
        
        # Tampilkan preview
        print("\n👥 PREVIEW ANGGOTA YANG AKAN DITAMBAHKAN:")
        for i, member in enumerate(source_members[:5]):
            name = member.get('full_name') or member.get('first_name') or 'No Name'
            username = member['username']
            print(f"   {i+1}. {name[:20]:20} - {username}")
        
        if len(source_members) > 5:
            print(f"   ... dan {len(source_members) - 5} lainnya")
        
        # Limit jumlah yang akan ditambahkan hari ini
        add_today = source_members[:MAX_ADD_PER_DAY]
        print(f"\n📌 Akan ditambahkan hari ini: {len(add_today)} anggota (max {MAX_ADD_PER_DAY}/hari)")
        
        # STEP 2: Dapatkan grup target
        print(f"\n🔍 Mencari grup target {TARGET_GROUP}...")
        try:
            target_channel = await client.get_input_entity(TARGET_GROUP)
            target_entity = await client.get_entity(TARGET_GROUP)
            print(f"✅ Grup target ditemukan: {getattr(target_entity, 'title', TARGET_GROUP)}")
        except Exception as e:
            print(f"❌ Gagal mendapatkan grup target: {e}")
            return
        
        # STEP 3: Tambahkan ke grup target
        success, failed = await add_to_target_group(client, add_today, target_channel)
        
        # Hasil akhir
        print("\n" + "="*60)
        print("📊 HASIL AKHIR MIGRASI")
        print("="*60)
        print(f"   ✅ Berhasil diundang: {success} anggota")
        print(f"   ❌ Gagal: {failed} anggota")
        print(f"   🎯 Target hari ini: {len(add_today)} anggota")
        
        if success > 0:
            print(f"\n🎉 {success} anggota berhasil dimigrasikan!")
            print(f"📁 Log disimpan: migration_log.txt")
            
            # Simpan data hasil scraping untuk batch berikutnya
            remaining = source_members[MAX_ADD_PER_DAY:]
            if remaining:
                with open('remaining_members.json', 'w', encoding='utf-8') as f:
                    json.dump({'members': remaining}, f, indent=2, ensure_ascii=False)
                print(f"💾 Sisa anggota disimpan: remaining_members.json")
                print(f"⏳ Batch berikutnya: {len(remaining)} anggota")
                print("💤 Rekomendasi: Tunggu 24 jam sebelum melanjutkan")
        
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
