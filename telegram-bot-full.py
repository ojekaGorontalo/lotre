#!/usr/bin/env python3
"""
HYBRID INVITE STRATEGY
1. User account scrap data
2. User account kirim invite link via PM
3. User klik link (auto-join tanpa limit)
"""

import asyncio
import json
import random
from datetime import datetime, timedelta
from telethon import TelegramClient, errors

# ========== KONFIGURASI ==========
API_ID = '38020832'
API_HASH = '32d3d237d7b0b74c1bfb1baa865f882c'
SOURCE_GROUP = 'vvip55wealthmabar'
TARGET_GROUP = '@wingo130s'

MAX_SCRAPE = 100
MESSAGES_PER_DAY = 40  # Kirim 40 pesan/hari
DELAY_MINUTES = random.randint(3, 7)  # Random 3-7 menit

async def main():
    print("="*60)
    print("🚀 HYBRID INVITE STRATEGY")
    print("="*60)
    
    # Step 1: Login dengan User Account
    print("\n🔐 LOGIN DENGAN USER ACCOUNT...")
    user_client = TelegramClient('hybrid_user', API_ID, API_HASH)
    await user_client.start()
    
    me = await user_client.get_me()
    print(f"✅ Login sebagai: {me.first_name}")
    print(f"📱 Phone: {me.phone}")
    
    # Step 2: Dapatkan Invite Link dari Grup Target
    print("\n🔗 MENDAPATKAN INVITE LINK...")
    try:
        target = await user_client.get_entity(TARGET_GROUP)
        print(f"🎯 Grup target: {getattr(target, 'title', TARGET_GROUP)}")
        
        # Coba buat invite link (harus admin)
        from telethon.tl.functions.messages import ExportChatInviteRequest
        invite = await user_client(ExportChatInviteRequest(
            target,
            title="Invite from Script",
            expire_date=int((datetime.now() + timedelta(days=7)).timestamp()),  # 7 hari
            usage_limit=0,  # Unlimited
            request_needed=False  # No admin approval needed
        ))
        invite_link = invite.link
        print(f"✅ Invite Link: {invite_link}")
        
    except Exception as e:
        print(f"❌ Gagal buat invite link: {e}")
        print("⚠️  Anda harus ADMIN di grup target!")
        print("💡 Minta invite link ke admin grup target")
        invite_link = input("Masukkan invite link manual: ").strip()
    
    # Step 3: Scrape Anggota dari Grup Sumber
    print("\n🔍 MENGAMBIL ANGGOTA DARI GRUP SUMBER...")
    source = await user_client.get_entity(SOURCE_GROUP)
    print(f"📥 Grup sumber: {getattr(source, 'title', SOURCE_GROUP)}")
    
    users = []
    async for user in user_client.iter_participants(source, limit=MAX_SCRAPE):
        if not user.bot and user.id != me.id:  # Skip bot dan diri sendiri
            users.append({
                'id': user.id,
                'name': f"{user.first_name or ''} {user.last_name or ''}".strip(),
                'username': user.username or 'NO_USERNAME',
                'has_username': bool(user.username)
            })
    
    print(f"👥 Ditemukan {len(users)} anggota")
    
    # Step 4: Template Pesan
    message_templates = [
        f"""Halo! 👋

Anda diundang untuk bergabung dengan grup **WinGo Predictor** 🎯

🔗 Join di sini: {invite_link}

Grup ini berisi prediksi akurat dan informasi eksklusif.

Salam,
Admin""",

        f"""Assalamu'alaikum / Hello! 😊

Undangan bergabung dengan grup premium:

✨ **WinGo 130 Predictor** ✨

Link: {invite_link}

*Link berlaku 7 hari*

Best regards,""",

        f"""Halo Member! 🚀

Kami melihat Anda aktif di grup prediksi.

Mari bergabung dengan komunitas kami:
🔗 {invite_link}

Fitur:
✅ Prediksi harian
✅ Analisis mendalam
✅ Support 24/7

Join sekarang! 💫""",
    ]
    
    # Step 5: Konfirmasi
    to_message = users[:MESSAGES_PER_DAY]
    print(f"\n📤 AKAN KIRIM KE {len(to_message)} USER")
    print(f"   • Dengan username: {len([u for u in to_message if u['has_username']])}")
    print(f"   • Tanpa username: {len([u for u in to_message if not u['has_username']])}")
    print(f"   • Delay: {DELAY_MINUTES} menit antar pesan")
    print(f"   • Estimasi waktu: {len(to_message) * DELAY_MINUTES} menit")
    
    confirm = input("\n🚀 LANJUTKAN? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Dibatalkan")
        await user_client.disconnect()
        return
    
    # Step 6: Kirim Pesan
    print("\n" + "="*60)
    print("📨 MULAI MENGIRIM PESAN...")
    print("="*60)
    
    success = 0
    failed = 0
    blocked = 0
    
    for i, user in enumerate(to_message):
        print(f"\n[{i+1}/{len(to_message)}] {user['name']}")
        print(f"   ID: {user['id']} | Username: {user['username']}")
        
        try:
            # Pilih pesan random
            message = random.choice(message_templates)
            
            # Kirim pesan
            await user_client.send_message(
                user['id'],
                message,
                link_preview=False,
                silent=True
            )
            
            print(f"   ✅ Pesan terkirim")
            success += 1
            
            # Log sukses
            with open('sent_success.log', 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now().isoformat()}|{user['id']}|{user['name']}|{user['username']}\n")
            
        except errors.UserIsBlockedError:
            print(f"   ❌ User memblokir Anda")
            blocked += 1
            
        except errors.PeerIdInvalidError:
            print(f"   ❌ User ID tidak valid")
            failed += 1
            
        except errors.InputUserDeactivatedError:
            print(f"   ❌ Akun user tidak aktif")
            failed += 1
            
        except errors.FloodWaitError as e:
            print(f"   ⏳ FLOOD WAIT: {e.seconds} detik")
            failed += 1
            
            if e.seconds > 0:
                minutes = e.seconds // 60
                seconds = e.seconds % 60
                print(f"   💤 Tunggu {minutes}m {seconds}s...")
                await asyncio.sleep(e.seconds)
                
        except Exception as e:
            error_msg = str(e)
            print(f"   ❌ Error: {error_msg[:60]}")
            failed += 1
        
        # Delay random 3-7 menit
        if i < len(to_message) - 1:
            delay = random.randint(180, 420)  # 3-7 menit dalam detik
            minutes = delay // 60
            print(f"   ⏰ Delay {minutes} menit...")
            await asyncio.sleep(delay)
    
    # Step 7: Hasil
    print("\n" + "="*60)
    print("📊 HASIL AKHIR")
    print("="*60)
    print(f"   ✅ Berhasil: {success} pesan")
    print(f"   ❌ Gagal: {failed} pesan")
    print(f"   🚫 Diblokir: {blocked} user")
    print(f"   🎯 Target: {len(to_message)} user")
    
    if success > 0:
        print(f"\n🎉 {success} user berhasil dikirimi invite link!")
        print(f"🔗 Link: {invite_link}")
        print(f"📁 Log: sent_success.log")
        
        print(f"\n💡 STATISTIK JOIN:")
        print(f"   • Biasanya 10-30% dari yang dikirimi akan join")
        print(f"   • Estimasi join: {int(success * 0.2)}-{int(success * 0.4)} user")
    
    print(f"\n⚠️  CATATAN:")
    print(f"   1. User perlu KLIK LINK untuk join")
    print(f"   2. Link berlaku 7 hari")
    print(f"   3. Tidak ada limit join via link")
    print(f"   4. Tunggu 24 jam untuk batch berikutnya")
    
    # Simpan data untuk batch berikutnya
    remaining = users[MESSAGES_PER_DAY:]
    if remaining:
        with open('remaining_users.json', 'w') as f:
            json.dump(remaining, f, indent=2)
        print(f"\n💾 Sisa {len(remaining)} user disimpan: remaining_users.json")
    
    await user_client.disconnect()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n❌ Dihentikan oleh user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
