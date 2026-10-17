use anchor_lang::prelude::*;

use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

declare_id!("Hz4PTohCwEEWfNVLVqWq2V1e7BEcuDEfb2kLUxniWmjo");

pub const ESCROW_PROGRAM_ID: Pubkey = pubkey!("E13gKpCo3pmg1QizBgEt2kxkVuTXAN6mrQQaS4aAt9LZ");

pub const ESCROW_ACCOUNT_DISCRIMINATOR: [u8; 8] = [31, 213, 123, 187, 186, 22, 218, 155];

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
        preferred_contact: String,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(ships_from.len() <= 64, MarketplaceError::TextTooLong);
        require!(
            seller_deposit_bps <= 10000,
            MarketplaceError::InvalidDepositPercent
        );
        require!(
            preferred_contact.len() <= 300,
            MarketplaceError::TextTooLong
        );

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.authority = ctx.accounts.authority.key();
        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.ships_from = ships_from;
        merchant.seller_deposit_bps = seller_deposit_bps;
        merchant.total_sold = 0;
        merchant.preferred_contact = preferred_contact;
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
        preferred_contact: String,
        active: bool,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(ships_from.len() <= 64, MarketplaceError::TextTooLong);
        require!(
            seller_deposit_bps <= 10000,
            MarketplaceError::InvalidDepositPercent
        );
        require!(
            preferred_contact.len() <= 300,
            MarketplaceError::TextTooLong
        );

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.ships_from = ships_from;
        merchant.seller_deposit_bps = seller_deposit_bps;
        merchant.preferred_contact = preferred_contact;
        merchant.active = active;

        Ok(())
    }

    pub fn create_product(
        ctx: Context<CreateProduct>,
        product_id: u64,
        title: String,
        description_uri: String,
        image_uris: Vec<String>,
        category: String,
        price: u64,
        stock: u32,
        seller_deposit_bps_override: Option<u16>,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uris.len() <= 3, MarketplaceError::TooManyImages);
        for image_uri in &image_uris {
            require!(
                !image_uri.trim().is_empty(),
                MarketplaceError::InvalidImageUri
            );

            require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        }
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);

        if let Some(bps) = seller_deposit_bps_override {
            require!(bps <= 10_000, MarketplaceError::InvalidDepositPercent);
        }

        let product = &mut ctx.accounts.product;

        product.merchant = ctx.accounts.authority.key();
        product.product_id = product_id;
        product.title = title;
        product.description_uri = description_uri;
        product.image_uris = image_uris;
        product.category = category;
        product.price = price;
        product.seller_deposit_bps_override = seller_deposit_bps_override;
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
        image_uris: Vec<String>,
        category: String,
        price: u64,
        stock: u32,
        active: bool,
        seller_deposit_bps_override: Option<u16>,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uris.len() <= 3, MarketplaceError::TooManyImages);
        for image_uri in &image_uris {
            require!(
                !image_uri.trim().is_empty(),
                MarketplaceError::InvalidImageUri
            );

            require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        }
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);

        if let Some(bps) = seller_deposit_bps_override {
            require!(bps <= 10_000, MarketplaceError::InvalidDepositPercent);
        }

        let product = &mut ctx.accounts.product;

        product.title = title;
        product.description_uri = description_uri;
        product.image_uris = image_uris;
        product.category = category;
        product.price = price;
        product.seller_deposit_bps_override = seller_deposit_bps_override;
        product.stock = stock;
        product.active = active;
        product.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn delete_product(ctx: Context<DeleteProduct>) -> Result<()> {
        let product = &mut ctx.accounts.product;

        product.active = false;
        product.deleted = true;
        product.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn send_message(ctx: Context<SendMessage>, message_id: u64, message: String) -> Result<()> {
        require!(!message.trim().is_empty(), MarketplaceError::EmptyMessage);

        require!(message.len() <= 280, MarketplaceError::MessageTooLong);

        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        let external_escrow = decode_external_escrow(data.as_ref())?;

        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        // Saka i-validate ang decoded parties.
        require!(
            external_escrow.party_a != Pubkey::default()
                && external_escrow.party_b != Pubkey::default()
                && external_escrow.party_a != external_escrow.party_b,
            MarketplaceError::InvalidEscrowParties
        );

        let sender = ctx.accounts.sender.key();

        require!(
            sender == external_escrow.party_a || sender == external_escrow.party_b,
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

    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation;

        reputation.merchant = ctx.accounts.merchant_profile.authority;
        reputation.total_reviews = 0;
        reputation.total_rating = 0;
        reputation.five_star = 0;
        reputation.four_star = 0;
        reputation.three_star = 0;
        reputation.two_star = 0;
        reputation.one_star = 0;
        reputation.bump = ctx.bumps.reputation;

        Ok(())
    }

    pub fn submit_review(ctx: Context<SubmitReview>, rating: u8, comment: String) -> Result<()> {
        require!((1..=5).contains(&rating), MarketplaceError::InvalidRating);

        require!(comment.len() <= 280, MarketplaceError::ReviewTooLong);

        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        let external_escrow = decode_external_escrow(data.as_ref())?;

        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        require!(
            external_escrow.status == 3,
            MarketplaceError::OrderNotCompleted
        );

        let reviewer = ctx.accounts.reviewer.key();
        let merchant = ctx.accounts.merchant_profile.authority;

        require_keys_eq!(
            reviewer,
            external_escrow.party_a,
            MarketplaceError::OnlyBuyerCanReview
        );

        // Merchant must be the actual seller.
        require_keys_eq!(
            merchant,
            external_escrow.party_b,
            MarketplaceError::InvalidReviewMerchant
        );

        let order = &ctx.accounts.order_record;

        require_keys_eq!(order.buyer, reviewer, MarketplaceError::OnlyBuyerCanReview);

        require_keys_eq!(
            order.seller,
            merchant,
            MarketplaceError::InvalidReviewMerchant
        );

        require_keys_eq!(
            order.product,
            ctx.accounts.product.key(),
            MarketplaceError::InvalidReviewProduct
        );

        let review = &mut ctx.accounts.review;

        review.escrow = ctx.accounts.escrow.key();
        review.order_record = order.key();
        review.product = ctx.accounts.product.key();
        review.merchant = merchant;
        review.reviewer = reviewer;
        review.rating = rating;
        review.comment = comment;
        review.created_at = Clock::get()?.unix_timestamp;
        review.bump = ctx.bumps.review;

        let reputation = &mut ctx.accounts.reputation;

        reputation.total_reviews = reputation
            .total_reviews
            .checked_add(1)
            .ok_or(MarketplaceError::MathOverflow)?;

        reputation.total_rating = reputation
            .total_rating
            .checked_add(rating as u64)
            .ok_or(MarketplaceError::MathOverflow)?;

        match rating {
            5 => {
                reputation.five_star = reputation
                    .five_star
                    .checked_add(1)
                    .ok_or(MarketplaceError::MathOverflow)?;
            }
            4 => {
                reputation.four_star = reputation
                    .four_star
                    .checked_add(1)
                    .ok_or(MarketplaceError::MathOverflow)?;
            }
            3 => {
                reputation.three_star = reputation
                    .three_star
                    .checked_add(1)
                    .ok_or(MarketplaceError::MathOverflow)?;
            }
            2 => {
                reputation.two_star = reputation
                    .two_star
                    .checked_add(1)
                    .ok_or(MarketplaceError::MathOverflow)?;
            }
            1 => {
                reputation.one_star = reputation
                    .one_star
                    .checked_add(1)
                    .ok_or(MarketplaceError::MathOverflow)?;
            }
            _ => unreachable!(),
        }

        Ok(())
    }

    pub fn create_purchase_offer(
        ctx: Context<CreatePurchaseOffer>,
        unit_price: u64,
        quantity: u32,
    ) -> Result<()> {
        require!(unit_price > 0, MarketplaceError::InvalidPrice);
        require!(quantity > 0, MarketplaceError::InvalidQuantity);

        let product = &ctx.accounts.product;
        let merchant = &ctx.accounts.merchant_profile;
        let buyer = ctx.accounts.buyer.key();
        let seller = product.merchant;

        require!(
            product.active && !product.deleted,
            MarketplaceError::ProductInactive
        );

        require!(merchant.active, MarketplaceError::MerchantInactive);

        require!(
            product.stock >= quantity,
            MarketplaceError::InsufficientStock
        );

        require!(buyer != seller, MarketplaceError::InvalidEscrowParties);

        // Negotiated total price, in lamports.
        let total_price = unit_price
            .checked_mul(quantity as u64)
            .ok_or(MarketplaceError::MathOverflow)?;

        // Product override, otherwise merchant default.
        let deposit_bps = product
            .seller_deposit_bps_override
            .unwrap_or(merchant.seller_deposit_bps) as u64;

        let calculated_deposit = total_price
            .checked_mul(deposit_bps)
            .ok_or(MarketplaceError::MathOverflow)?
            / 10_000;

        let security_deposit = calculated_deposit.max(1);

        // Buyer must deposit total price + buyer security bond.
        let buyer_deposit = total_price
            .checked_add(security_deposit)
            .ok_or(MarketplaceError::MathOverflow)?;

        // Verify external escrow program ownership.
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        // Decode external escrow account.
        let data = escrow_info.try_borrow_data()?;
        let external_escrow = decode_external_escrow(data.as_ref())?;

        // Verify marketplace marker.
        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        let is_buy = external_escrow.note.contains("\"checkout\":\"buy\"");
        let is_offer = external_escrow.note.contains("\"checkout\":\"offer\"");

        require!(is_buy != is_offer, MarketplaceError::InvalidOfferEscrow);

        // Buy Now must use the listed product price.
        if is_buy {
            require!(
                unit_price == product.price,
                MarketplaceError::InvalidOrderAmount
            );
        }

        // Make Offer must be below the listed price.
        if is_offer {
            require!(
                unit_price < product.price,
                MarketplaceError::InvalidOrderAmount
            );
        }

        // Buyer must be the escrow creator and party A.
        require_keys_eq!(
            external_escrow.creator,
            buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_a,
            buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        // Seller must be escrow party B.
        require_keys_eq!(
            external_escrow.party_b,
            seller,
            MarketplaceError::InvalidOrderSeller
        );

        require!(
            external_escrow.party_a != Pubkey::default()
                && external_escrow.party_b != Pubkey::default()
                && external_escrow.party_a != external_escrow.party_b,
            MarketplaceError::InvalidEscrowParties
        );

        // Escrow must be in its initial status.
        require!(
            external_escrow.status == 0,
            MarketplaceError::InvalidOrderStatus
        );

        // Escrow reference amount must match negotiated price.
        require!(
            external_escrow.reference_amount == total_price,
            MarketplaceError::InvalidOrderAmount
        );

        // Verify required buyer deposit.
        require!(
            external_escrow.required_deposit_a == buyer_deposit,
            MarketplaceError::InvalidBuyerDeposit
        );

        // Verify buyer actually deposited the full amount.
        require!(
            external_escrow.deposited_a == buyer_deposit,
            MarketplaceError::BuyerDepositIncomplete
        );

        // Verify seller's required security deposit.
        require!(
            external_escrow.required_deposit_b == security_deposit,
            MarketplaceError::InvalidSellerDeposit
        );

        // Save PurchaseOffer PDA.
        let offer = &mut ctx.accounts.purchase_offer;

        offer.product = product.key();
        offer.escrow = ctx.accounts.escrow.key();
        offer.buyer = buyer;
        offer.seller = seller;

        offer.unit_price = unit_price;
        offer.quantity = quantity;
        offer.total_price = total_price;
        offer.security_deposit = security_deposit;
        offer.buyer_deposit = buyer_deposit;

        offer.status = 0; // Pending
        offer.created_at = Clock::get()?.unix_timestamp;
        offer.bump = ctx.bumps.purchase_offer;

        Ok(())
    }

    pub fn accept_purchase_offer(ctx: Context<AcceptPurchaseOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.purchase_offer;
        let product = &mut ctx.accounts.product;

        let seller = ctx.accounts.seller.key();

        // 1. Seller authorization.
        require_keys_eq!(offer.seller, seller, MarketplaceError::Unauthorized);

        // 2. Offer must still be pending.
        require!(offer.status == 0, MarketplaceError::OfferNotPending);

        // 3. Product must still be available.
        require!(
            product.active && !product.deleted,
            MarketplaceError::ProductInactive
        );

        require!(
            product.stock >= offer.quantity,
            MarketplaceError::InsufficientStock
        );

        require!(
            offer.quantity > 0 && offer.unit_price > 0,
            MarketplaceError::InvalidQuantity
        );

        // 4. Verify stored negotiated total.
        let total_price = offer
            .unit_price
            .checked_mul(offer.quantity as u64)
            .ok_or(MarketplaceError::MathOverflow)?;

        require!(
            total_price == offer.total_price,
            MarketplaceError::InvalidOrderAmount
        );

        let expected_buyer_deposit = total_price
            .checked_add(offer.security_deposit)
            .ok_or(MarketplaceError::MathOverflow)?;

        require!(
            expected_buyer_deposit == offer.buyer_deposit,
            MarketplaceError::InvalidBuyerDeposit
        );

        // 5. Verify external escrow owner.
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;
        let external_escrow = decode_external_escrow(data.as_ref())?;

        // 6. Verify escrow markers.
        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        // Accept both Buy Now and Make Offer escrows.
        let is_buy = external_escrow.note.contains("\"checkout\":\"buy\"");
        let is_offer = external_escrow.note.contains("\"checkout\":\"offer\"");

        require!(is_buy != is_offer, MarketplaceError::InvalidOfferEscrow);

        // Buy Now must retain the listed price.
        if is_buy {
            require!(
                offer.unit_price == product.price,
                MarketplaceError::InvalidOrderAmount
            );
        }

        // Make Offer must retain a valid negotiated price.
        if is_offer {
            require!(offer.unit_price > 0, MarketplaceError::InvalidOrderAmount);
        }

        // 7. Verify escrow participants.
        require_keys_eq!(
            external_escrow.creator,
            offer.buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_a,
            offer.buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_b,
            seller,
            MarketplaceError::InvalidOrderSeller
        );

        require!(
            offer.buyer != seller,
            MarketplaceError::InvalidEscrowParties
        );

        // 8. Escrow must still be in the expected state.
        require!(
            external_escrow.status == 0,
            MarketplaceError::InvalidOrderStatus
        );

        // 9. Verify exact negotiated price and deposits.
        require!(
            external_escrow.reference_amount == total_price,
            MarketplaceError::InvalidOrderAmount
        );

        require!(
            external_escrow.required_deposit_a == offer.buyer_deposit,
            MarketplaceError::InvalidBuyerDeposit
        );

        require!(
            external_escrow.deposited_a == offer.buyer_deposit,
            MarketplaceError::BuyerDepositIncomplete
        );

        require!(
            external_escrow.deposited_b == 0,
            MarketplaceError::InvalidSellerDeposit
        );

        require_keys_eq!(
            external_escrow.vault,
            ctx.accounts.vault.key(),
            MarketplaceError::InvalidOfferEscrow
        );

        let (expected_vault, _) = Pubkey::find_program_address(
            &[b"vault", ctx.accounts.escrow.key().as_ref()],
            &ESCROW_PROGRAM_ID,
        );

        require_keys_eq!(
            expected_vault,
            ctx.accounts.vault.key(),
            MarketplaceError::InvalidOfferEscrow
        );

        // Release read borrow before CPI modifies the escrow account.
        drop(data);

        // Anchor discriminator for deposit:
        // [242, 35, 198, 137, 82, 225, 242, 182]
        let mut instruction_data = vec![242, 35, 198, 137, 82, 225, 242, 182];

        instruction_data.extend_from_slice(&offer.security_deposit.to_le_bytes());

        let deposit_ix = Instruction {
            program_id: ESCROW_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.seller.key(), true),
                AccountMeta::new(ctx.accounts.escrow.key(), false),
                AccountMeta::new(ctx.accounts.vault.key(), false),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            data: instruction_data,
        };

        invoke(
            &deposit_ix,
            &[
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.escrow_program.to_account_info(),
            ],
        )?;

        // Re-read escrow after CPI.
        let updated_data = ctx.accounts.escrow.try_borrow_data()?;

        let updated_escrow = decode_external_escrow(updated_data.as_ref())?;

        require!(
            updated_escrow.status == 1,
            MarketplaceError::InvalidOrderStatus
        );

        require!(
            updated_escrow.deposited_a == offer.buyer_deposit
                && updated_escrow.deposited_b == offer.security_deposit,
            MarketplaceError::InvalidSellerDeposit
        );

        // 10. Reserve stock.
        product.stock = product
            .stock
            .checked_sub(offer.quantity)
            .ok_or(MarketplaceError::InsufficientStock)?;

        let now = Clock::get()?.unix_timestamp;

        product.updated_at = now;

        // 11. Create order record using negotiated price.
        let order = &mut ctx.accounts.order_record;

        order.escrow = ctx.accounts.escrow.key();
        order.product = product.key();
        order.buyer = offer.buyer;
        order.seller = seller;
        order.quantity = offer.quantity;
        order.price = total_price;
        order.created_at = now;
        order.bump = ctx.bumps.order_record;

        // 12. Mark offer accepted.
        offer.status = 1;

        Ok(())
    }

    pub fn reject_purchase_offer(ctx: Context<RejectPurchaseOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.purchase_offer;

        require!(offer.status == 0, MarketplaceError::OfferNotPending);

        require_keys_eq!(
            offer.seller,
            ctx.accounts.seller.key(),
            MarketplaceError::Unauthorized
        );

        offer.status = 2; // Rejected

        Ok(())
    }

    pub fn withdraw_purchase_offer(ctx: Context<WithdrawPurchaseOffer>) -> Result<()> {
        let offer = &ctx.accounts.purchase_offer;

        require!(
            offer.status == 0 || offer.status == 2,
            MarketplaceError::OfferNotWithdrawable
        );

        require_keys_eq!(
            offer.buyer,
            ctx.accounts.buyer.key(),
            MarketplaceError::Unauthorized
        );

        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;
        let external_escrow = decode_external_escrow(data.as_ref())?;

        require_keys_eq!(
            external_escrow.creator,
            offer.buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_a,
            offer.buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_b,
            offer.seller,
            MarketplaceError::InvalidOrderSeller
        );

        require!(
            external_escrow.status == 0,
            MarketplaceError::InvalidOrderStatus
        );

        require!(
            external_escrow.deposited_a == offer.buyer_deposit && external_escrow.deposited_b == 0,
            MarketplaceError::InvalidBuyerDeposit
        );

        require_keys_eq!(
            external_escrow.vault,
            ctx.accounts.vault.key(),
            MarketplaceError::InvalidOfferEscrow
        );

        let (expected_vault, _) = Pubkey::find_program_address(
            &[b"vault", ctx.accounts.escrow.key().as_ref()],
            &ESCROW_PROGRAM_ID,
        );

        require_keys_eq!(
            expected_vault,
            ctx.accounts.vault.key(),
            MarketplaceError::InvalidOfferEscrow
        );

        drop(data);

        // Anchor discriminator for withdraw_before_complete.
        let withdraw_ix = Instruction {
            program_id: ESCROW_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.buyer.key(), true),
                AccountMeta::new(ctx.accounts.escrow.key(), false),
                AccountMeta::new(ctx.accounts.creator.key(), false),
                AccountMeta::new(ctx.accounts.vault.key(), false),
            ],
            data: vec![40, 0, 254, 7, 88, 174, 147, 166],
        };

        // Execute the escrow refund through CPI.
        invoke(
            &withdraw_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.escrow_program.to_account_info(),
            ],
        )?;

        // Verify escrow closure after successful CPI refund.
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            anchor_lang::solana_program::system_program::ID,
            MarketplaceError::InvalidEscrowOwner
        );

        require!(
            escrow_info.data_is_empty(),
            MarketplaceError::InvalidEscrowAccount
        );

        // The SSScrow CPI completed successfully and the escrow is closed.
        ctx.accounts.purchase_offer.status = 3;

        Ok(())
    }

    pub fn create_order_record(ctx: Context<CreateOrderRecord>, quantity: u32) -> Result<()> {
        require!(quantity > 0, MarketplaceError::InvalidQuantity);

        let product = &mut ctx.accounts.product;

        require!(product.active, MarketplaceError::ProductInactive);

        require!(!product.deleted, MarketplaceError::ProductInactive);

        require!(
            product.stock >= quantity,
            MarketplaceError::InsufficientStock
        );

        let total_price = product
            .price
            .checked_mul(quantity as u64)
            .ok_or(MarketplaceError::MathOverflow)?;

        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        let external_escrow = decode_external_escrow(data.as_ref())?;

        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        require!(
            external_escrow.note.contains("\"checkout\":\"buy\""),
            MarketplaceError::InvalidOfferEscrow
        );

        require_keys_eq!(
            external_escrow.party_a,
            ctx.accounts.buyer.key(),
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.creator,
            ctx.accounts.buyer.key(),
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_b,
            product.merchant,
            MarketplaceError::InvalidOrderSeller
        );

        require!(
            external_escrow.party_a != Pubkey::default()
                && external_escrow.party_b != Pubkey::default()
                && external_escrow.party_a != external_escrow.party_b,
            MarketplaceError::InvalidEscrowParties
        );

        require!(
            external_escrow.status == 0,
            MarketplaceError::InvalidOrderStatus
        );

        // Product override, otherwise merchant default.
        let deposit_bps = product
            .seller_deposit_bps_override
            .unwrap_or(ctx.accounts.merchant_profile.seller_deposit_bps)
            as u64;

        // Calculate security deposit.
        let calculated_deposit = total_price
            .checked_mul(deposit_bps)
            .ok_or(MarketplaceError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(MarketplaceError::MathOverflow)?;

        // Minimum of 1 lamport.
        let security_deposit = if calculated_deposit == 0 {
            1
        } else {
            calculated_deposit
        };

        // Buyer locks:
        // product price + refundable buyer security deposit.
        let expected_buyer_deposit = total_price
            .checked_add(security_deposit)
            .ok_or(MarketplaceError::MathOverflow)?;

        // Product price must remain unchanged.
        require!(
            external_escrow.reference_amount == total_price,
            MarketplaceError::InvalidOrderAmount
        );

        // Buyer must escrow price + buyer bond.
        require!(
            external_escrow.required_deposit_a == expected_buyer_deposit,
            MarketplaceError::InvalidBuyerDeposit
        );

        // Buyer must actually deposit everything.
        require!(
            external_escrow.deposited_a == expected_buyer_deposit,
            MarketplaceError::BuyerDepositIncomplete
        );

        // Seller must escrow the configured bond.
        require!(
            external_escrow.required_deposit_b == security_deposit,
            MarketplaceError::InvalidSellerDeposit
        );

        product.stock = product
            .stock
            .checked_sub(quantity)
            .ok_or(MarketplaceError::InsufficientStock)?;

        product.updated_at = Clock::get()?.unix_timestamp;

        let order = &mut ctx.accounts.order_record;

        order.escrow = ctx.accounts.escrow.key();
        order.product = product.key();
        order.buyer = ctx.accounts.buyer.key();
        order.seller = product.merchant;
        order.quantity = quantity;
        order.price = total_price;
        order.created_at = Clock::get()?.unix_timestamp;
        order.bump = ctx.bumps.order_record;

        Ok(())
    }

    pub fn record_completed_sale(ctx: Context<RecordCompletedSale>) -> Result<()> {
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        let external_escrow = decode_external_escrow(data.as_ref())?;

        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        require!(
            external_escrow.status == 3,
            MarketplaceError::OrderNotCompleted
        );

        require_keys_eq!(
            external_escrow.party_a,
            ctx.accounts.buyer.key(),
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_b,
            ctx.accounts.order_record.seller,
            MarketplaceError::InvalidOrderSeller
        );

        let quantity = ctx.accounts.order_record.quantity;

        ctx.accounts.product.sold = ctx
            .accounts
            .product
            .sold
            .checked_add(quantity)
            .ok_or(MarketplaceError::MathOverflow)?;

        ctx.accounts.product.updated_at = Clock::get()?.unix_timestamp;

        ctx.accounts.merchant_profile.total_sold = ctx
            .accounts
            .merchant_profile
            .total_sold
            .checked_add(quantity)
            .ok_or(MarketplaceError::MathOverflow)?;

        let completed_sale = &mut ctx.accounts.completed_sale;

        completed_sale.order_record = ctx.accounts.order_record.key();

        completed_sale.product = ctx.accounts.product.key();

        completed_sale.quantity = quantity;

        completed_sale.completed_at = Clock::get()?.unix_timestamp;

        completed_sale.bump = ctx.bumps.completed_sale;

        Ok(())
    }

    pub fn restore_cancelled_order_stock(ctx: Context<RestoreCancelledOrderStock>) -> Result<()> {
        let escrow_info = ctx.accounts.escrow.to_account_info();

        require_keys_eq!(
            *escrow_info.owner,
            ESCROW_PROGRAM_ID,
            MarketplaceError::InvalidEscrowOwner
        );

        let data = escrow_info.try_borrow_data()?;

        let external_escrow = decode_external_escrow(data.as_ref())?;

        require!(
            external_escrow
                .note
                .contains("\"marketplace\":\"solbazaar\""),
            MarketplaceError::NotSolBazaarEscrow
        );

        /*
         * cancelled/refunded statuses of escrow program.
         */
        require!(
            external_escrow.status == 4,
            MarketplaceError::OrderNotCancelled
        );

        require_keys_eq!(
            external_escrow.party_a,
            ctx.accounts.order_record.buyer,
            MarketplaceError::InvalidOrderBuyer
        );

        require_keys_eq!(
            external_escrow.party_b,
            ctx.accounts.order_record.seller,
            MarketplaceError::InvalidOrderSeller
        );

        let quantity = ctx.accounts.order_record.quantity;

        ctx.accounts.product.stock = ctx
            .accounts
            .product
            .stock
            .checked_add(quantity)
            .ok_or(MarketplaceError::MathOverflow)?;

        ctx.accounts.product.updated_at = Clock::get()?.unix_timestamp;

        let restoration = &mut ctx.accounts.stock_restoration;

        restoration.order_record = ctx.accounts.order_record.key();

        restoration.product = ctx.accounts.product.key();

        restoration.quantity = quantity;

        restoration.restored_at = Clock::get()?.unix_timestamp;

        restoration.bump = ctx.bumps.stock_restoration;

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
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized,
        constraint = !product.deleted @ MarketplaceError::ProductDeleted
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
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

    #[max_len(300)]
    pub preferred_contact: String,

    pub seller_deposit_bps: u16,
    pub total_sold: u32,

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

    #[max_len(3, 250)]
    pub image_uris: Vec<String>,

    #[max_len(32)]
    pub category: String,

    pub price: u64,
    pub seller_deposit_bps_override: Option<u16>,
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
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized,
        constraint = !product.deleted @ MarketplaceError::ProductDeleted
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
}

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

fn take_bytes<'a>(input: &mut &'a [u8], length: usize) -> Result<&'a [u8]> {
    require!(
        input.len() >= length,
        MarketplaceError::InvalidEscrowAccount
    );

    let (value, remaining) = input.split_at(length);

    *input = remaining;

    Ok(value)
}

fn read_u8(input: &mut &[u8]) -> Result<u8> {
    let bytes = take_bytes(input, 1)?;

    Ok(bytes[0])
}

fn read_u32(input: &mut &[u8]) -> Result<u32> {
    let bytes = take_bytes(input, 4)?;

    let array: [u8; 4] = bytes
        .try_into()
        .map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))?;

    Ok(u32::from_le_bytes(array))
}

fn read_u64(input: &mut &[u8]) -> Result<u64> {
    let bytes = take_bytes(input, 8)?;

    let array: [u8; 8] = bytes
        .try_into()
        .map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))?;

    Ok(u64::from_le_bytes(array))
}

fn read_i64(input: &mut &[u8]) -> Result<i64> {
    let bytes = take_bytes(input, 8)?;

    let array: [u8; 8] = bytes
        .try_into()
        .map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))?;

    Ok(i64::from_le_bytes(array))
}

fn read_pubkey(input: &mut &[u8]) -> Result<Pubkey> {
    let bytes = take_bytes(input, 32)?;

    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))?;

    Ok(Pubkey::new_from_array(array))
}

fn read_bounded_string(input: &mut &[u8], max_length: usize) -> Result<String> {
    let length = read_u32(input)? as usize;

    require!(length <= max_length, MarketplaceError::InvalidEscrowAccount);

    let bytes = take_bytes(input, length)?;

    String::from_utf8(bytes.to_vec()).map_err(|_| error!(MarketplaceError::InvalidEscrowAccount))
}

fn decode_external_escrow(account_data: &[u8]) -> Result<ExternalEscrow> {
    require!(
        account_data.len() >= 8,
        MarketplaceError::InvalidEscrowAccount
    );

    require!(
        account_data.get(..8) == Some(ESCROW_ACCOUNT_DISCRIMINATOR.as_slice()),
        MarketplaceError::InvalidEscrowDiscriminator
    );

    let mut data = &account_data[8..];

    let creator = read_pubkey(&mut data)?;

    let party_a = read_pubkey(&mut data)?;

    let party_b = read_pubkey(&mut data)?;

    let escrow_type = read_u8(&mut data)?;

    let required_deposit_a = read_u64(&mut data)?;

    let required_deposit_b = read_u64(&mut data)?;

    let deposited_a = read_u64(&mut data)?;

    let deposited_b = read_u64(&mut data)?;

    let proposed_payout_a = read_u64(&mut data)?;

    let proposed_payout_b = read_u64(&mut data)?;

    let finalization_proposer = read_pubkey(&mut data)?;

    /*
     * Escrow contract:
     * #[max_len(200)]
     */
    let finalization_note = read_bounded_string(&mut data, 200)?;

    let vault = read_pubkey(&mut data)?;

    let status = read_u8(&mut data)?;

    let created_at = read_i64(&mut data)?;

    let deposit_at = read_i64(&mut data)?;

    let finalized_at = read_i64(&mut data)?;

    /*
     * Escrow contract:
     * #[max_len(200)]
     */
    let note = read_bounded_string(&mut data, 200)?;

    let reference_amount = read_u64(&mut data)?;

    let proposed_donation = read_u64(&mut data)?;

    Ok(ExternalEscrow {
        creator,
        party_a,
        party_b,
        escrow_type,
        required_deposit_a,
        required_deposit_b,
        deposited_a,
        deposited_b,
        proposed_payout_a,
        proposed_payout_b,
        finalization_proposer,
        finalization_note,
        vault,
        status,
        created_at,
        deposit_at,
        finalized_at,
        note,
        reference_amount,
        proposed_donation,
    })
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

#[account]
#[derive(InitSpace)]
pub struct MerchantReputation {
    pub merchant: Pubkey,
    pub total_reviews: u64,
    pub total_rating: u64,
    pub five_star: u64,
    pub four_star: u64,
    pub three_star: u64,
    pub two_star: u64,
    pub one_star: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MerchantReview {
    pub escrow: Pubkey,
    pub order_record: Pubkey,
    pub product: Pubkey,
    pub merchant: Pubkey,
    pub reviewer: Pubkey,
    pub rating: u8,

    #[max_len(280)]
    pub comment: String,

    pub created_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    #[account(
        seeds = [
            b"merchant",
            merchant_profile.authority.as_ref()
        ],
        bump = merchant_profile.bump
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = payer,
        space = 8 + MerchantReputation::INIT_SPACE,
        seeds = [
            b"reputation",
            merchant_profile.authority.as_ref()
        ],
        bump
    )]
    pub reputation: Account<'info, MerchantReputation>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitReview<'info> {
    #[account(mut)]
    pub reviewer: Signer<'info>,

    /// CHECK:
    /// External escrow verified inside submit_review.
    pub escrow: UncheckedAccount<'info>,

    #[account(
        seeds = [
            b"merchant",
            merchant_profile.authority.as_ref()
        ],
        bump = merchant_profile.bump
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        seeds = [
            b"order",
            escrow.key().as_ref()
        ],
        bump = order_record.bump,
        constraint = order_record.escrow == escrow.key()
            @ MarketplaceError::InvalidOrderRecord,
        constraint = order_record.buyer == reviewer.key()
            @ MarketplaceError::OnlyBuyerCanReview,
        constraint = order_record.seller == merchant_profile.authority
            @ MarketplaceError::InvalidReviewMerchant
    )]
    pub order_record: Account<'info, OrderRecord>,

    #[account(
        constraint = product.key() == order_record.product
            @ MarketplaceError::InvalidReviewProduct,
        constraint = product.merchant == merchant_profile.authority
            @ MarketplaceError::InvalidReviewMerchant
    )]
    pub product: Account<'info, Product>,

    #[account(
        mut,
        seeds = [
            b"reputation",
            merchant_profile.authority.as_ref()
        ],
        bump = reputation.bump,
        constraint =
            reputation.merchant == merchant_profile.authority
            @ MarketplaceError::InvalidReviewMerchant
    )]
    pub reputation: Account<'info, MerchantReputation>,

    #[account(
        init,
        payer = reviewer,
        space = 8 + MerchantReview::INIT_SPACE,
        seeds = [
            b"review",
            order_record.key().as_ref()
        ],
        bump
    )]
    pub review: Account<'info, MerchantReview>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct PurchaseOffer {
    pub product: Pubkey,
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,

    pub unit_price: u64,
    pub quantity: u32,
    pub total_price: u64,
    pub security_deposit: u64,
    pub buyer_deposit: u64,

    // 0 = Pending
    // 1 = Accepted
    // 2 = Rejected
    // 3 = Withdrawn
    pub status: u8,

    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OrderRecord {
    pub escrow: Pubkey,
    pub product: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub quantity: u32,
    pub price: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct CreatePurchaseOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Validated inside create_purchase_offer.
    pub escrow: UncheckedAccount<'info>,

    pub product: Account<'info, Product>,

    #[account(
        seeds = [
            b"merchant",
            product.merchant.as_ref()
        ],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == product.merchant
            @ MarketplaceError::InvalidOrderSeller,
        constraint = merchant_profile.active
            @ MarketplaceError::MerchantInactive
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = buyer,
        space = 8 + PurchaseOffer::INIT_SPACE,
        seeds = [
            b"purchase_offer",
            escrow.key().as_ref()
        ],
        bump
    )]
    pub purchase_offer: Account<'info, PurchaseOffer>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptPurchaseOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: External escrow owner and data validated in instruction.
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            b"purchase_offer",
            escrow.key().as_ref()
        ],
        bump = purchase_offer.bump,
        constraint = purchase_offer.escrow == escrow.key()
            @ MarketplaceError::InvalidOfferEscrow,
        constraint = purchase_offer.seller == seller.key()
            @ MarketplaceError::Unauthorized
    )]
    pub purchase_offer: Account<'info, PurchaseOffer>,

    #[account(
        mut,
        constraint = product.key() == purchase_offer.product
            @ MarketplaceError::InvalidOfferProduct,
        constraint = product.merchant == seller.key()
            @ MarketplaceError::InvalidOrderSeller
    )]
    pub product: Account<'info, Product>,

    #[account(
        seeds = [
            b"merchant",
            seller.key().as_ref()
        ],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == seller.key()
            @ MarketplaceError::Unauthorized,
        constraint = merchant_profile.active
            @ MarketplaceError::MerchantInactive
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = seller,
        space = 8 + OrderRecord::INIT_SPACE,
        seeds = [
            b"order",
            escrow.key().as_ref()
        ],
        bump
    )]
    pub order_record: Account<'info, OrderRecord>,

    /// CHECK: Validated against escrow's stored vault and PDA.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: Must be the configured generic escrow program.
    #[account(address = ESCROW_PROGRAM_ID)]
    pub escrow_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectPurchaseOffer<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"purchase_offer",
            purchase_offer.escrow.as_ref()
        ],
        bump = purchase_offer.bump,
        constraint = purchase_offer.seller == seller.key()
            @ MarketplaceError::Unauthorized
    )]
    pub purchase_offer: Account<'info, PurchaseOffer>,
}

#[derive(Accounts)]
pub struct WithdrawPurchaseOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Validated in the instruction.
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            b"purchase_offer",
            escrow.key().as_ref()
        ],
        bump = purchase_offer.bump,
        constraint = purchase_offer.escrow == escrow.key()
            @ MarketplaceError::InvalidOfferEscrow,
        constraint = purchase_offer.buyer == buyer.key()
            @ MarketplaceError::Unauthorized
    )]
    pub purchase_offer: Account<'info, PurchaseOffer>,

    /// CHECK: Must be the escrow creator and buyer.
    #[account(
        mut,
        address = buyer.key() @ MarketplaceError::Unauthorized
    )]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: PDA and escrow vault address validated in instruction.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: Fixed external escrow program ID.
    #[account(
        executable,
        address = ESCROW_PROGRAM_ID @ MarketplaceError::InvalidEscrowOwner
    )]
    pub escrow_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CreateOrderRecord<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK:
    /// External escrow verified inside create_order_record using
    /// owner, discriminator, deserialization, parties, and amount.
    pub escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = product.active
            @ MarketplaceError::ProductInactive,
        constraint = !product.deleted
            @ MarketplaceError::ProductInactive
    )]
    pub product: Account<'info, Product>,

    #[account(
        seeds = [
            b"merchant",
            product.merchant.as_ref()
        ],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority
            == product.merchant
            @ MarketplaceError::InvalidOrderSeller,
        constraint = merchant_profile.active
            @ MarketplaceError::MerchantInactive
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = buyer,
        space = 8 + OrderRecord::INIT_SPACE,
        seeds = [
            b"order",
            escrow.key().as_ref()
        ],
        bump
    )]
    pub order_record: Account<'info, OrderRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordCompletedSale<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Verified inside the instruction.
    pub escrow: UncheckedAccount<'info>,

    #[account(
        seeds = [
            b"order",
            escrow.key().as_ref()
        ],
        bump = order_record.bump,
        constraint =
            order_record.escrow == escrow.key()
                @ MarketplaceError::InvalidOrderRecord,
        constraint =
            order_record.buyer == buyer.key()
                @ MarketplaceError::InvalidOrderBuyer,
        constraint =
            order_record.product == product.key()
                @ MarketplaceError::InvalidReviewProduct
    )]
    pub order_record: Account<'info, OrderRecord>,

    #[account(
        mut,
        constraint =
            product.merchant == order_record.seller
                @ MarketplaceError::InvalidOrderSeller
    )]
    pub product: Account<'info, Product>,

    #[account(
        mut,
        seeds = [
            b"merchant",
            order_record.seller.as_ref()
        ],
        bump = merchant_profile.bump,
        constraint =
            merchant_profile.authority
                == order_record.seller
                @ MarketplaceError::InvalidOrderSeller
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = buyer,
        space = 8 + CompletedSale::INIT_SPACE,
        seeds = [
            b"completed-sale",
            order_record.key().as_ref()
        ],
        bump
    )]
    pub completed_sale: Account<'info, CompletedSale>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct CompletedSale {
    pub order_record: Pubkey,
    pub product: Pubkey,
    pub quantity: u32,
    pub completed_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct RestoreCancelledOrderStock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Verified inside the instruction.
    pub escrow: UncheckedAccount<'info>,

    #[account(
        seeds = [
            b"order",
            escrow.key().as_ref()
        ],
        bump = order_record.bump,
        constraint =
            order_record.escrow == escrow.key()
                @ MarketplaceError::InvalidOrderRecord,
        constraint =
            order_record.product == product.key()
                @ MarketplaceError::InvalidReviewProduct
    )]
    pub order_record: Account<'info, OrderRecord>,

    #[account(
        mut,
        constraint =
            product.merchant == order_record.seller
                @ MarketplaceError::InvalidOrderSeller
    )]
    pub product: Account<'info, Product>,

    #[account(
        init,
        payer = payer,
        space = 8 + StockRestoration::INIT_SPACE,
        seeds = [
            b"stock-restoration",
            order_record.key().as_ref()
        ],
        bump
    )]
    pub stock_restoration: Account<'info, StockRestoration>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct StockRestoration {
    pub order_record: Pubkey,
    pub product: Pubkey,
    pub quantity: u32,
    pub restored_at: i64,
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

    #[msg("Rating must be between 1 and 5")]
    InvalidRating,

    #[msg("Review comment is too long")]
    ReviewTooLong,

    #[msg("Order must be completed")]
    OrderNotCompleted,

    #[msg("Only the buyer can review this order")]
    OnlyBuyerCanReview,

    #[msg("Merchant does not match the escrow seller")]
    InvalidReviewMerchant,

    #[msg("Product does not match the completed order")]
    InvalidReviewProduct,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("This escrow is not a SolBazaar order")]
    NotSolBazaarEscrow,

    #[msg("Invalid SolBazaar order record")]
    InvalidOrderRecord,

    #[msg("Order buyer does not match escrow buyer")]
    InvalidOrderBuyer,

    #[msg("Order seller does not match escrow seller")]
    InvalidOrderSeller,

    #[msg("Order amount does not match product total")]
    InvalidOrderAmount,

    #[msg("Buyer deposit is incomplete")]
    BuyerDepositIncomplete,

    #[msg("Escrow seller deposit does not match merchant settings")]
    InvalidSellerDeposit,

    #[msg("Buyer deposit does not match the required escrow amount")]
    InvalidBuyerDeposit,

    #[msg("Escrow is not in a valid state for order creation")]
    InvalidOrderStatus,

    #[msg("Order must be cancelled or refunded")]
    OrderNotCancelled,

    #[msg("A product can have a maximum of three images")]
    TooManyImages,

    #[msg("Image URL cannot be empty")]
    InvalidImageUri,

    #[msg("Deleted product cannot be modified")]
    ProductDeleted,

    #[msg("Invalid PurchaseOffer escrow")]
    InvalidOfferEscrow,

    #[msg("PurchaseOffer product mismatch")]
    InvalidOfferProduct,

    #[msg("PurchaseOffer is not pending")]
    OfferNotPending,

    #[msg("PurchaseOffer cannot be withdrawn")]
    OfferNotWithdrawable,

    #[msg("Escrow must be cancelled before withdrawal is recorded")]
    EscrowNotCancelled,
}

solana_security_txt::security_txt! {
    name: "Solzaar",
    project_url: "https://github.com/Vermont-Secure-Computing/openbazaar",
    contacts: "mailto:office@vtscc.org",
    policy: "https://github.com/Vermont-Secure-Computing/openbazaar",
    source_code: "https://github.com/Vermont-Secure-Computing/openbazaar",
    preferred_languages: "en",
    auditors: ""
}
