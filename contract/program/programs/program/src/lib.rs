use anchor_lang::prelude::*;

declare_id!("9MfxguocK4gW2CZigXwpj97YumQ6a8S4twXGLfnaw3tj");

pub const ESCROW_PROGRAM_ID: Pubkey =
    pubkey!("E13gKpCo3pmg1QizBgEt2kxkVuTXAN6mrQQaS4aAt9LZ");

pub const ESCROW_ACCOUNT_DISCRIMINATOR: [u8; 8] = [
    31, 213, 123, 187, 186, 22, 218, 155,
];

#[program]
pub mod sol_bazaar {
    use super::*;

    pub fn create_merchant(
        ctx: Context<CreateMerchant>,
        store_name: String,
        description_uri: String,
        logo_uri: String,
        banner_uri: String,
        ships_from: String,
        seller_deposit_bps: u16,
        email: String,
        phone: String,
        website: String,
        facebook: String,
        instagram: String,
        telegram: String,
        x: String,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(ships_from.len() <= 64, MarketplaceError::TextTooLong);
        require!(email.len() <= 100, MarketplaceError::TextTooLong);
        require!(phone.len() <= 30, MarketplaceError::TextTooLong);
        require!(website.len() <= 150, MarketplaceError::TextTooLong);
        require!(facebook.len() <= 100, MarketplaceError::TextTooLong);
        require!(instagram.len() <= 100, MarketplaceError::TextTooLong);
        require!(telegram.len() <= 100, MarketplaceError::TextTooLong);
        require!(x.len() <= 100, MarketplaceError::TextTooLong);
        require!(seller_deposit_bps <= 10000, MarketplaceError::InvalidDepositPercent);    

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.authority = ctx.accounts.authority.key();
        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.ships_from = ships_from;
        merchant.seller_deposit_bps = seller_deposit_bps;
        merchant.email = email;
        merchant.phone = phone;
        merchant.website = website;
        merchant.facebook = facebook;
        merchant.instagram = instagram;
        merchant.telegram = telegram;
        merchant.x = x;
        merchant.active = true;
        merchant.created_at = Clock::get()?.unix_timestamp;
        merchant.bump = ctx.bumps.merchant_profile;
        merchant.verified = false;

        Ok(())
    }

    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        store_name: String,
        description_uri: String,
        logo_uri: String,
        banner_uri: String,
        ships_from: String,
        seller_deposit_bps: u16,
        email: String,
        phone: String,
        website: String,
        facebook: String,
        instagram: String,
        telegram: String,
        x: String,
        active: bool,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(ships_from.len() <= 64, MarketplaceError::TextTooLong);
        require!(email.len() <= 100, MarketplaceError::TextTooLong);
        require!(phone.len() <= 30, MarketplaceError::TextTooLong);
        require!(website.len() <= 150, MarketplaceError::TextTooLong);
        require!(facebook.len() <= 100, MarketplaceError::TextTooLong);
        require!(instagram.len() <= 100, MarketplaceError::TextTooLong);
        require!(telegram.len() <= 100, MarketplaceError::TextTooLong);
        require!(x.len() <= 100, MarketplaceError::TextTooLong);
        require!(seller_deposit_bps <= 10000, MarketplaceError::InvalidDepositPercent);

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.ships_from = ships_from;
        merchant.seller_deposit_bps = seller_deposit_bps;
        merchant.email = email;
        merchant.phone = phone;
        merchant.website = website;
        merchant.facebook = facebook;
        merchant.instagram = instagram;
        merchant.telegram = telegram;
        merchant.x = x;
        merchant.active = active;

        Ok(())
    }

    pub fn create_product(
        ctx: Context<CreateProduct>,
        product_id: u64,
        title: String,
        description_uri: String,
        image_uri: String,
        category: String,
        price: u64,
        stock: u32,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);
    
        let product = &mut ctx.accounts.product;
    
        product.merchant = ctx.accounts.authority.key();
        product.product_id = product_id;
        product.title = title;
        product.description_uri = description_uri;
        product.image_uri = image_uri;
        product.category = category;
        product.price = price;
        product.stock = stock;
        product.sold = 0;
        product.active = true;
        product.created_at = Clock::get()?.unix_timestamp;
        product.bump = ctx.bumps.product;
        product.updated_at = Clock::get()?.unix_timestamp;
        product.deleted = false;
    
        Ok(())
    }

    pub fn update_product(
        ctx: Context<UpdateProduct>,
        title: String,
        description_uri: String,
        image_uri: String,
        category: String,
        price: u64,
        stock: u32,
        active: bool,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);
    
        let product = &mut ctx.accounts.product;
    
        product.title = title;
        product.description_uri = description_uri;
        product.image_uri = image_uri;
        product.category = category;
        product.price = price;
        product.stock = stock;
        product.active = active;
        product.updated_at = Clock::get()?.unix_timestamp;
    
        Ok(())
    }

    pub fn reduce_stock(
        ctx: Context<ReduceStock>,
        quantity: u32,
    ) -> Result<()> {
        let product = &mut ctx.accounts.product;

        require!(product.active, MarketplaceError::ProductInactive);
        require!(quantity > 0, MarketplaceError::InvalidQuantity);
        require!(product.stock >= quantity, MarketplaceError::InsufficientStock);

        product.stock -= quantity;
        product.sold += quantity;

        Ok(())
    }

    pub fn delete_product(ctx: Context<DeleteProduct>) -> Result<()> {
        let product = &mut ctx.accounts.product;
    
        product.active = false;
        product.deleted = true;
        product.updated_at = Clock::get()?.unix_timestamp;
    
        Ok(())
    }

    pub fn send_message(
        ctx: Context<SendMessage>,
        message_id: u64,
        message: String,
    ) -> Result<()> {
        require!(
            !message.trim().is_empty(),
            MarketplaceError::EmptyMessage
        );
    
        require!(
            message.len() <= 280,
            MarketplaceError::MessageTooLong
        );
    
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        require!(
            data.len() >= 8,
            MarketplaceError::InvalidEscrowAccount
        );

        require!(
            data.get(..8) == Some(ESCROW_ACCOUNT_DISCRIMINATOR.as_slice()),
            MarketplaceError::InvalidEscrowDiscriminator
        );

        // Decode muna bago gamitin ang external_escrow.
        let mut escrow_data: &[u8] = &data[8..];

        let external_escrow =
            ExternalEscrow::deserialize(&mut escrow_data)
                .map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))?;

        // Saka i-validate ang decoded parties.
        require!(
            external_escrow.party_a != Pubkey::default()
                && external_escrow.party_b != Pubkey::default()
                && external_escrow.party_a != external_escrow.party_b,
            MarketplaceError::InvalidEscrowParties
        );

        let sender = ctx.accounts.sender.key();

        require!(
            sender == external_escrow.party_a
                || sender == external_escrow.party_b,
            MarketplaceError::Unauthorized
        );
    
        let chat = &mut ctx.accounts.chat_message;
    
        chat.escrow = ctx.accounts.escrow.key();
        chat.sender = sender;
        chat.message = message;
        chat.created_at = Clock::get()?.unix_timestamp;
        chat.message_id = message_id;
        chat.bump = ctx.bumps.chat_message;
    
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMerchant<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MerchantProfile::INIT_SPACE,
        seeds = [b"merchant", authority.key().as_ref()],
        bump
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMerchant<'info> {
    #[account(
        mut,
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(product_id: u64)]
pub struct CreateProduct<'info> {
    #[account(
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == authority.key() @ MarketplaceError::Unauthorized,
        constraint = merchant_profile.active @ MarketplaceError::MerchantInactive
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = authority,
        space = 8 + Product::INIT_SPACE,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product_id.to_le_bytes()
        ],
        bump
    )]
    pub product: Account<'info, Product>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProduct<'info> {
    #[account(
        mut,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product.product_id.to_le_bytes()
        ],
        bump = product.bump,
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReduceStock<'info> {
    #[account(mut)]
    pub product: Account<'info, Product>,
}

#[account]
#[derive(InitSpace)]
pub struct MerchantProfile {
    pub authority: Pubkey,

    #[max_len(64)]
    pub store_name: String,

    #[max_len(200)]
    pub description_uri: String,

    #[max_len(200)]
    pub logo_uri: String,

    #[max_len(200)]
    pub banner_uri: String,

    #[max_len(64)]
    pub ships_from: String,

    #[max_len(100)]
    pub email: String,

    #[max_len(30)]
    pub phone: String,

    #[max_len(150)]
    pub website: String,

    #[max_len(100)]
    pub facebook: String,

    #[max_len(100)]
    pub instagram: String,

    #[max_len(100)]
    pub telegram: String,

    #[max_len(100)]
    pub x: String,

    pub seller_deposit_bps: u16,
    pub active: bool,
    pub verified: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Product {
    pub merchant: Pubkey,
    pub product_id: u64,

    #[max_len(64)]
    pub title: String,

    #[max_len(200)]
    pub description_uri: String,

    #[max_len(250)]
    pub image_uri: String,

    #[max_len(32)]
    pub category: String,

    pub price: u64,
    pub stock: u32,
    pub sold: u32,
    pub active: bool,
    pub deleted: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct DeleteProduct<'info> {
    #[account(
        mut,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product.product_id.to_le_bytes()
        ],
        bump = product.bump,
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
}

#[derive(AnchorDeserialize)]
pub struct ExternalEscrow {
    pub creator: Pubkey,

    pub party_a: Pubkey,
    pub party_b: Pubkey,

    pub escrow_type: u8,

    pub required_deposit_a: u64,
    pub required_deposit_b: u64,

    pub deposited_a: u64,
    pub deposited_b: u64,

    pub proposed_payout_a: u64,
    pub proposed_payout_b: u64,

    pub finalization_proposer: Pubkey,
    pub finalization_note: String,

    pub vault: Pubkey,
    pub status: u8,

    pub created_at: i64,
    pub deposit_at: i64,
    pub finalized_at: i64,

    pub note: String,
    pub reference_amount: u64,
    pub proposed_donation: u64,
}

#[derive(Accounts)]
#[instruction(message_id: u64)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    /// CHECK:
    /// External escrow account verified inside `send_message` through:
    /// owner check, discriminator check, deserialization, and party validation.
    pub escrow: UncheckedAccount<'info>,

    #[account(
        init,
        payer = sender,
        space = 8 + ChatMessage::INIT_SPACE,
        seeds = [
            b"message",
            escrow.key().as_ref(),
            &message_id.to_le_bytes()
        ],
        bump
    )]
    pub chat_message: Account<'info, ChatMessage>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct ChatMessage {
    pub escrow: Pubkey,
    pub sender: Pubkey,

    #[max_len(280)]
    pub message: String,

    pub created_at: i64,
    pub message_id: u64,
    pub bump: u8,
}


#[error_code]
pub enum MarketplaceError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Text too long")]
    TextTooLong,

    #[msg("Invalid price")]
    InvalidPrice,

    #[msg("Invalid quantity")]
    InvalidQuantity,

    #[msg("Insufficient stock")]
    InsufficientStock,

    #[msg("Merchant is inactive")]
    MerchantInactive,

    #[msg("Product is inactive")]
    ProductInactive,

    #[msg("Invalid deposit percent")]
    InvalidDepositPercent,

    #[msg("Message is too long")]
    MessageTooLong,

    #[msg("Message cannot be empty")]
    EmptyMessage,

    #[msg("Invalid escrow program owner")]
    InvalidEscrowOwner,

    #[msg("Invalid escrow account")]
    InvalidEscrowAccount,

    #[msg("Invalid escrow account discriminator")]
    InvalidEscrowDiscriminator,

    #[msg("Invalid escrow parties")]
    InvalidEscrowParties,
}